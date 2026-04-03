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

export function useProjectProcesses(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { data: processMaster = [], isFetched: typesFetched } = useProcessTypes();
  const [processes, setProcesses] = useState<ProjectProcess[]>([]);
  const [loading, setLoading] = useState(true);

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
      const { data: created, error: insertErr } = await supabase
        .from("project_processes")
        .insert(inserts)
        .select("*");
      if (!handleSupabaseError(insertErr, "project_processes insert")) {
        setProcesses((created ?? []) as ProjectProcess[]);
      }
    } else {
      setProcesses(data as ProjectProcess[]);
    }
    setLoading(false);
  }, [projectId, typesFetched, processMaster, queryClient]);

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

  const addProcess = useCallback(async (label: string) => {
    if (!projectId) return;
    const key = `custom_${Date.now()}`;
    const maxOrder = processes.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { data, error } = await supabase.from("project_processes").insert({
      project_id: projectId,
      process_key: key,
      process_label: label,
      sort_order: maxOrder + 1,
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
