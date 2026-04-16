import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { buildDefaultProcessInsertsWithFallback, type ProcessTypeRow } from "@/lib/process-types";
import { useProcessTypes, PROCESS_TYPES_QUERY_KEY } from "@/hooks/useProcessTypes";

export interface ProjectProcess {
  id: string;
  project_id: string;
  process_key: string;
  process_label: string;
  sort_order: number;
  is_active: boolean;
  is_common: boolean;
  deadline: string | null;
  client_deadline: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function toEpoch(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

function pickCanonicalProcess(a: ProjectProcess, b: ProjectProcess): ProjectProcess {
  const aUpdated = toEpoch(a.updated_at);
  const bUpdated = toEpoch(b.updated_at);
  if (aUpdated !== bUpdated) return aUpdated > bUpdated ? a : b;
  const aCreated = toEpoch(a.created_at);
  const bCreated = toEpoch(b.created_at);
  if (aCreated !== bCreated) return aCreated > bCreated ? a : b;
  if (a.sort_order !== b.sort_order) return a.sort_order < b.sort_order ? a : b;
  return a;
}

function dedupeByProcessKey(rows: ProjectProcess[]): {
  unique: ProjectProcess[];
  duplicateIds: string[];
} {
  const byKey = new Map<string, ProjectProcess>();
  for (const row of rows) {
    const prev = byKey.get(row.process_key);
    if (!prev) {
      byKey.set(row.process_key, row);
      continue;
    }
    byKey.set(row.process_key, pickCanonicalProcess(prev, row));
  }
  const unique = [...byKey.values()].sort((a, b) => a.sort_order - b.sort_order);
  const keepIds = new Set(unique.map((r) => r.id));
  const duplicateIds = rows.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
  return { unique, duplicateIds };
}

export function useProjectProcesses(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { data: processMaster = [], isFetched: typesFetched } = useProcessTypes();
  const [processes, setProcesses] = useState<ProjectProcess[]>([]);
  const [loading, setLoading] = useState(true);

  const cleanupDuplicateProcesses = useCallback(
    async (rows: ProjectProcess[]): Promise<ProjectProcess[]> => {
      const { unique, duplicateIds } = dedupeByProcessKey(rows);
      if (duplicateIds.length > 0) {
        const { error: delErr } = await supabase
          .from("project_processes")
          .delete()
          .in("id", duplicateIds);
        handleSupabaseError(delErr, "dedupe duplicate processes");
      }

      const normalized = unique.map((p, i) => ({ ...p, sort_order: i + 1 }));
      for (const p of normalized) {
        const current = unique.find((u) => u.id === p.id);
        if (!current || current.sort_order === p.sort_order) continue;
        const { error: orderErr } = await supabase
          .from("project_processes")
          .update({ sort_order: p.sort_order })
          .eq("id", p.id);
        handleSupabaseError(orderErr, "normalize process sort_order");
      }
      return normalized;
    },
    []
  );

  const fetchProcesses = useCallback(async () => {
    if (!projectId) {
      setProcesses([]);
      setLoading(false);
      return;
    }
    if (!typesFetched) {
      setLoading(true);
      return;
    }

    const master =
      queryClient.getQueryData<ProcessTypeRow[]>(PROCESS_TYPES_QUERY_KEY) ?? processMaster;

    setLoading(true);
    const { data, error } = await supabase
      .from("project_processes")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order");

    if (handleSupabaseError(error, "project_processes")) {
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      const { data: proj, error: pErr } = await supabase
        .from("projects")
        .select("creative_type")
        .eq("id", projectId)
        .single();
      if (handleSupabaseError(pErr, "project creative_type")) {
        setLoading(false);
        return;
      }
      const creativeType = proj?.creative_type ?? "video";
      const templateRows = buildDefaultProcessInsertsWithFallback(master, creativeType);
      const inserts = templateRows.map((p) => ({
        project_id: projectId,
        ...p,
      }));
      const { error: insertErr } = await supabase
        .from("project_processes")
        .insert(inserts)
        .select("id");
      if (!handleSupabaseError(insertErr, "project_processes insert")) {
        // 同時初期化で重複行が作られることがあるため、挿入後に再取得して正規化
        const { data: freshRows, error: refetchErr } = await supabase
          .from("project_processes")
          .select("*")
          .eq("project_id", projectId)
          .order("sort_order");
        if (!handleSupabaseError(refetchErr, "project_processes refetch after insert")) {
          const normalized = await cleanupDuplicateProcesses((freshRows ?? []) as ProjectProcess[]);
          setProcesses(normalized);
        }
      }
    } else {
      const normalized = await cleanupDuplicateProcesses(data as ProjectProcess[]);
      setProcesses(normalized);
    }
    setLoading(false);
  }, [projectId, typesFetched, processMaster, queryClient, cleanupDuplicateProcesses]);

  useEffect(() => {
    void fetchProcesses();
  }, [fetchProcesses]);

  const updateProcess = useCallback(async (id: string, updates: Partial<ProjectProcess>) => {
    const { error } = await supabase
      .from("project_processes")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!handleSupabaseError(error, "process update")) {
      setProcesses((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    }
    return !error;
  }, []);

  const reorderProcesses = useCallback(async (reordered: ProjectProcess[]) => {
    setProcesses(reordered);
    const updates = reordered.map((p, i) => ({
      id: p.id,
      sort_order: i + 1,
    }));
    for (const u of updates) {
      await supabase.from("project_processes").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
  }, []);

  const addProcess = useCallback(async (label: string, options?: { mixedLane?: "banner" | "video" }) => {
    if (!projectId) return;
    const key =
      options?.mixedLane === "banner"
        ? `custom_banner_${Date.now()}`
        : options?.mixedLane === "video"
          ? `custom_video_${Date.now()}`
          : `custom_${Date.now()}`;
    const maxOrder = processes.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { data, error } = await supabase.from("project_processes").insert({
      project_id: projectId,
      process_key: key,
      process_label: label,
      sort_order: maxOrder + 1,
      is_common: false,
    }).select("*").single();
    if (!handleSupabaseError(error, "add process") && data) {
      setProcesses((prev) => [...prev, data as ProjectProcess]);
    }
  }, [projectId, processes]);

  const deleteProcess = useCallback(async (id: string) => {
    const { error } = await supabase.from("project_processes").delete().eq("id", id);
    if (!handleSupabaseError(error, "delete process")) {
      setProcesses((prev) => prev.filter((p) => p.id !== id));
    }
  }, []);

  const resetToDefaults = useCallback(async () => {
    if (!projectId) return;
    const master =
      queryClient.getQueryData<ProcessTypeRow[]>(PROCESS_TYPES_QUERY_KEY) ?? processMaster;
    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("creative_type")
      .eq("id", projectId)
      .single();
    if (handleSupabaseError(pErr, "project creative_type")) return;
    const creativeType = proj?.creative_type ?? "video";
    const templateRows = buildDefaultProcessInsertsWithFallback(master, creativeType);
    await supabase.from("project_processes").delete().eq("project_id", projectId);
    const inserts = templateRows.map((p) => ({ project_id: projectId, ...p }));
    const { data, error } = await supabase.from("project_processes").insert(inserts).select("*");
    if (!handleSupabaseError(error, "reset processes")) {
      setProcesses((data ?? []) as ProjectProcess[]);
    }
  }, [projectId, processMaster, queryClient]);

  return {
    processes,
    loading,
    updateProcess,
    reorderProcesses,
    addProcess,
    deleteProcess,
    resetToDefaults,
    refetch: fetchProcesses,
  };
}
