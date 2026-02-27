import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";

export interface Pattern {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function usePatterns(projectId: string | undefined) {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPatterns = useCallback(async () => {
    if (!projectId) { setPatterns([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("patterns")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("sort_order");
    handleSupabaseError(error, "patterns");
    setPatterns((data as Pattern[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const addPattern = async (name: string, description?: string) => {
    if (!projectId) return;
    const maxSort = patterns.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { error } = await supabase.from("patterns").insert({
      project_id: projectId,
      name,
      description: description || null,
      sort_order: maxSort + 1,
    } as any);
    if (!handleSupabaseError(error, "add pattern")) await fetchPatterns();
  };

  const addPatternsBulk = async (items: { name: string; description: string }[]) => {
    if (!projectId || items.length === 0) return;
    const maxSort = patterns.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const rows = items.map((it, i) => ({
      project_id: projectId,
      name: it.name,
      description: it.description || null,
      sort_order: maxSort + 1 + i,
    }));
    const { error } = await supabase.from("patterns").insert(rows as any);
    if (!handleSupabaseError(error, "bulk add patterns")) await fetchPatterns();
  };

  const deletePattern = async (id: string) => {
    const { error } = await supabase.from("patterns").update({ is_active: false } as any).eq("id", id);
    if (!handleSupabaseError(error, "delete pattern")) await fetchPatterns();
  };

  const updatePattern = async (id: string, updates: Partial<Pick<Pattern, "name" | "description">>) => {
    const { error } = await supabase.from("patterns").update(updates as any).eq("id", id);
    if (!handleSupabaseError(error, "update pattern")) await fetchPatterns();
  };

  return { patterns, loading, addPattern, addPatternsBulk, deletePattern, updatePattern, refetch: fetchPatterns };
}
