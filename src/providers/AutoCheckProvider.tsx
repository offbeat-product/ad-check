import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import type { ProjectFile } from "@/lib/db-types";
import type { BulkSequentialProgressState } from "@/lib/bulk-sequential-check-types";

/** @deprecated Auto-queue for uploaded files is disabled; kept for API compatibility. */
export const MAX_CONCURRENT_AUTO_CHECKS_PER_PROJECT = 5;

interface SessionEntry {
  projectName: string;
}

export interface AutoCheckContextValue {
  /** No-op: auto drain of uploaded files is disabled (explicit AI check only). */
  scheduleDrain: (projectId: string) => void;
  markAutoCheckSession: (params: { projectId: string; projectName: string }) => void;
  /** Set briefly when a session completes globally so ProjectPage can flash the per-process badge */
  badgeFlashProjectId: string | null;
  /** 一括AIチェック（直列）のグローバル表示。永続化しない（リロードで再開しない） */
  bulkSequentialProgress: BulkSequentialProgressState | null;
  setBulkSequentialProgress: Dispatch<SetStateAction<BulkSequentialProgressState | null>>;
  registerBulkAbort: (ac: AbortController | null) => void;
  cancelBulkSequentialCheck: () => void;
  clearBulkSequentialProgress: () => void;
}

const AutoCheckContext = createContext<AutoCheckContextValue | null>(null);

export function useAutoCheck(): AutoCheckContextValue {
  const v = useContext(AutoCheckContext);
  if (!v) {
    throw new Error("useAutoCheck must be used within AutoCheckProvider");
  }
  return v;
}

interface ProviderProps {
  children: ReactNode;
}

export function AutoCheckProvider({ children }: ProviderProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const sessionProjectsRef = useRef<Map<string, SessionEntry>>(new Map());

  const [badgeFlashProjectId, setBadgeFlashProjectId] = useState<string | null>(null);
  const badgeClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [bulkSequentialProgress, setBulkSequentialProgress] = useState<BulkSequentialProgressState | null>(null);
  const bulkAbortRef = useRef<AbortController | null>(null);

  const registerBulkAbort = useCallback((ac: AbortController | null) => {
    bulkAbortRef.current = ac;
  }, []);

  const cancelBulkSequentialCheck = useCallback(() => {
    bulkAbortRef.current?.abort();
  }, []);

  const clearBulkSequentialProgress = useCallback(() => {
    setBulkSequentialProgress(null);
  }, []);

  const maybeToastProjectCompleteRef = useRef<(projectId: string) => Promise<void>>(async () => {});

  const clearAllState = useCallback(() => {
    sessionProjectsRef.current.clear();
    if (badgeClearTimerRef.current) {
      clearTimeout(badgeClearTimerRef.current);
      badgeClearTimerRef.current = null;
    }
    setBadgeFlashProjectId(null);
    bulkAbortRef.current?.abort();
    bulkAbortRef.current = null;
    setBulkSequentialProgress(null);
  }, []);

  useEffect(() => {
    if (!user) {
      clearAllState();
    }
  }, [user, clearAllState]);

  useEffect(() => {
    return () => {
      sessionProjectsRef.current.clear();
      if (badgeClearTimerRef.current) {
        clearTimeout(badgeClearTimerRef.current);
        badgeClearTimerRef.current = null;
      }
    };
  }, []);

  const markAutoCheckSession = useCallback((params: { projectId: string; projectName: string }) => {
    sessionProjectsRef.current.set(params.projectId, { projectName: params.projectName });
  }, []);

  const triggerBadgeFlash = useCallback((projectId: string) => {
    if (badgeClearTimerRef.current) clearTimeout(badgeClearTimerRef.current);
    setBadgeFlashProjectId(projectId);
    badgeClearTimerRef.current = setTimeout(() => {
      setBadgeFlashProjectId((cur) => (cur === projectId ? null : cur));
      badgeClearTimerRef.current = null;
    }, 8000);
  }, []);

  const maybeToastProjectComplete = useCallback(
    async (projectId: string) => {
      const session = sessionProjectsRef.current.get(projectId);
      if (!session) return;

      const { data: rows, error } = await supabase.from("project_files").select("*").eq("project_id", projectId);
      if (error || !rows?.length) return;

      const root = rows.filter((f) => !(f as ProjectFile).parent_file_id) as ProjectFile[];
      const aiRoots = root.filter(
        (f) => Boolean(f.file_data) && AI_CHECK_CONFIG[f.process_type || "script"]?.enabled
      );
      if (aiRoots.length === 0) {
        sessionProjectsRef.current.delete(projectId);
        return;
      }
      const pending = aiRoots.filter((f) => f.status === "uploaded" || f.status === "checking").length;
      if (pending > 0) return;

      sessionProjectsRef.current.delete(projectId);
      toast({
        title: `${session.projectName}: 全件チェック完了`,
        description: "AIチェックがすべて完了しました。",
      });
      triggerBadgeFlash(projectId);
    },
    [toast, triggerBadgeFlash]
  );

  useEffect(() => {
    maybeToastProjectCompleteRef.current = maybeToastProjectComplete;
  }, [maybeToastProjectComplete]);

  const scheduleDrain = useCallback((_projectId: string) => {}, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("auto-check-global-project_files")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_files" },
        (payload) => {
          const newFile = payload.new as ProjectFile | undefined;
          const oldFile = payload.old as { id?: string; status?: string; project_id?: string } | undefined;

          if (payload.eventType === "UPDATE" && newFile?.project_id) {
            const oldStatus = oldFile?.status;
            const newStatus = newFile.status;
            const becameChecked = newStatus === "checked" && oldStatus !== "checked";
            const becameError = newStatus === "error" && oldStatus !== "error";
            if (becameChecked || becameError) {
              void maybeToastProjectCompleteRef.current(newFile.project_id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const tick = async () => {
      const { data: checking, error } = await supabase
        .from("project_files")
        .select("id, check_result_id, project_id")
        .eq("status", "checking")
        .not("check_result_id", "is", null);

      if (error || !checking?.length) return;

      for (const row of checking) {
        if (!row.check_result_id || !row.project_id) continue;
        const { data: cr } = await supabase
          .from("check_results")
          .select("check_items")
          .eq("id", row.check_result_id)
          .maybeSingle();
        if (cr && Array.isArray(cr.check_items) && (cr.check_items as unknown[]).length > 0) {
          await supabase.from("project_files").update({ status: "checked" }).eq("id", row.id);
          void maybeToastProjectCompleteRef.current(row.project_id);
        }
      }
    };

    const id = window.setInterval(() => void tick(), 5000);
    return () => clearInterval(id);
  }, [user]);

  const value = useMemo(
    () => ({
      scheduleDrain,
      markAutoCheckSession,
      badgeFlashProjectId,
      bulkSequentialProgress,
      setBulkSequentialProgress,
      registerBulkAbort,
      cancelBulkSequentialCheck,
      clearBulkSequentialProgress,
    }),
    [
      scheduleDrain,
      markAutoCheckSession,
      badgeFlashProjectId,
      bulkSequentialProgress,
      registerBulkAbort,
      cancelBulkSequentialCheck,
      clearBulkSequentialProgress,
    ]
  );

  return <AutoCheckContext.Provider value={value}>{children}</AutoCheckContext.Provider>;
}
