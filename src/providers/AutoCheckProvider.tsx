import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { runSingleFileAiCheck } from "@/lib/run-single-file-ai-check";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import type { Client, Product, ProjectFile } from "@/lib/db-types";

/** Max concurrent root files in "checking" per project (n8n load). */
export const MAX_CONCURRENT_AUTO_CHECKS_PER_PROJECT = 5;

interface SessionEntry {
  projectName: string;
}

export interface AutoCheckContextValue {
  scheduleDrain: (projectId: string) => void;
  markAutoCheckSession: (params: { projectId: string; projectName: string }) => void;
  /** Set briefly when a session completes globally so ProjectPage can flash the per-process badge */
  badgeFlashProjectId: string | null;
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

const CONTEXT_CACHE_MS = 60_000;

export function AutoCheckProvider({ children }: ProviderProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const userRef = useRef(user);
  userRef.current = user;

  const skipByProjectRef = useRef<Map<string, Set<string>>>(new Map());
  const startingIdsRef = useRef<Set<string>>(new Set());
  const sessionProjectsRef = useRef<Map<string, SessionEntry>>(new Map());
  const drainTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** projectId::processKey → file ids currently running auto-check */
  const activeChecksRef = useRef<Map<string, Set<string>>>(new Map());
  const contextCacheRef = useRef<Map<string, { product: Product; client: Client | null; at: number }>>(
    new Map()
  );

  const [badgeFlashProjectId, setBadgeFlashProjectId] = useState<string | null>(null);
  const badgeClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleDrainRef = useRef<(projectId: string) => void>(() => {});
  const maybeToastProjectCompleteRef = useRef<(projectId: string) => Promise<void>>(async () => {});
  const drainProjectRef = useRef<(projectId: string) => Promise<void>>(async () => {});

  const clearAllState = useCallback(() => {
    drainTimersRef.current.forEach((t) => clearTimeout(t));
    drainTimersRef.current.clear();
    skipByProjectRef.current.clear();
    startingIdsRef.current.clear();
    sessionProjectsRef.current.clear();
    activeChecksRef.current.clear();
    contextCacheRef.current.clear();
    if (badgeClearTimerRef.current) {
      clearTimeout(badgeClearTimerRef.current);
      badgeClearTimerRef.current = null;
    }
    setBadgeFlashProjectId(null);
  }, []);

  useEffect(() => {
    if (!user) {
      clearAllState();
    }
  }, [user, clearAllState]);

  useEffect(() => {
    return () => {
      drainTimersRef.current.forEach((t) => clearTimeout(t));
      drainTimersRef.current.clear();
      skipByProjectRef.current.clear();
      startingIdsRef.current.clear();
      sessionProjectsRef.current.clear();
      activeChecksRef.current.clear();
      contextCacheRef.current.clear();
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

  const loadProjectContext = useCallback(async (projectId: string): Promise<{ product: Product; client: Client | null } | null> => {
    const now = Date.now();
    const cached = contextCacheRef.current.get(projectId);
    if (cached && now - cached.at < CONTEXT_CACHE_MS) {
      return { product: cached.product, client: cached.client };
    }

    const { data: proj, error: pErr } = await supabase.from("projects").select("id, product_id").eq("id", projectId).maybeSingle();
    if (pErr || !proj?.product_id) return null;

    const { data: product, error: prodErr } = await supabase
      .from("products_with_check_settings")
      .select("*")
      .eq("id", proj.product_id)
      .maybeSingle();
    if (prodErr || !product) return null;

    let client: Client | null = null;
    if (product.client_id) {
      const { data: cl } = await supabase.from("clients").select("*").eq("id", product.client_id).maybeSingle();
      client = cl;
    }

    contextCacheRef.current.set(projectId, { product, client, at: now });
    return { product, client };
  }, []);

  const drainProject = useCallback(
    async (projectId: string) => {
      const u = userRef.current;
      if (!u) return;

      const ctx = await loadProjectContext(projectId);
      if (!ctx) return;

      const { data: rows, error } = await supabase.from("project_files").select("*").eq("project_id", projectId);
      if (error || !rows?.length) return;

      const root = rows.filter((f) => !(f as ProjectFile).parent_file_id) as ProjectFile[];
      const checkingCount = root.filter((f) => f.status === "checking").length;
      const slots = Math.max(0, MAX_CONCURRENT_AUTO_CHECKS_PER_PROJECT - checkingCount);
      if (slots <= 0) return;

      let skipSet = skipByProjectRef.current.get(projectId);
      if (!skipSet) {
        skipSet = new Set();
        skipByProjectRef.current.set(projectId, skipSet);
      }

      const eligible = root
        .filter(
          (f) =>
            Boolean(f.file_data) &&
            f.status === "uploaded" &&
            AI_CHECK_CONFIG[f.process_type || "script"]?.enabled &&
            !skipSet.has(f.id) &&
            !startingIdsRef.current.has(f.id)
        )
        .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

      const toStart = eligible.slice(0, slots);

      const scheduleAgain = () => {
        const existing = drainTimersRef.current.get(projectId);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          drainTimersRef.current.delete(projectId);
          void drainProjectRef.current(projectId);
        }, 120);
        drainTimersRef.current.set(projectId, t);
      };

      for (const f of toStart) {
        if (startingIdsRef.current.has(f.id)) continue;
        startingIdsRef.current.add(f.id);
        const procKey = f.process_type || "script";
        const mapKey = `${projectId}::${procKey}`;
        let procSet = activeChecksRef.current.get(mapKey);
        if (!procSet) {
          procSet = new Set();
          activeChecksRef.current.set(mapKey, procSet);
        }
        procSet.add(f.id);

        void runSingleFileAiCheck({
          file: f,
          product: ctx.product,
          client: ctx.client,
          projectId,
          user: { id: u.id, email: u.email },
          claimUploaded: true,
        })
          .then((r) => {
            if (!r.success && !r.skipped && !r.asyncAccepted) {
              skipSet.add(f.id);
            }
          })
          .catch(() => {
            skipSet.add(f.id);
          })
          .finally(() => {
            startingIdsRef.current.delete(f.id);
            procSet.delete(f.id);
            if (procSet.size === 0) {
              activeChecksRef.current.delete(mapKey);
            }
            void maybeToastProjectCompleteRef.current(projectId);
            scheduleAgain();
          });
      }
    },
    [loadProjectContext]
  );

  useEffect(() => {
    drainProjectRef.current = drainProject;
  }, [drainProject]);

  const scheduleDrain = useCallback((projectId: string) => {
    if (!projectId) return;
    const existing = drainTimersRef.current.get(projectId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      drainTimersRef.current.delete(projectId);
      void drainProjectRef.current(projectId);
    }, 120);
    drainTimersRef.current.set(projectId, t);
  }, []);

  useEffect(() => {
    scheduleDrainRef.current = scheduleDrain;
  }, [scheduleDrain]);

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
            const revertedToUploaded = newStatus === "uploaded" && oldStatus === "checking";
            if (becameChecked || becameError || revertedToUploaded) {
              scheduleDrainRef.current(newFile.project_id);
            }
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
          scheduleDrainRef.current(row.project_id);
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
    }),
    [scheduleDrain, markAutoCheckSession, badgeFlashProjectId]
  );

  return <AutoCheckContext.Provider value={value}>{children}</AutoCheckContext.Provider>;
}
