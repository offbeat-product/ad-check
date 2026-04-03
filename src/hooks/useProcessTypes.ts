import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProcessTypeRow } from "@/lib/process-types";

export const PROCESS_TYPES_QUERY_KEY = ["process_types"] as const;

export function useProcessTypes() {
  return useQuery({
    queryKey: PROCESS_TYPES_QUERY_KEY,
    queryFn: async (): Promise<ProcessTypeRow[]> => {
      const { data, error } = await supabase
        .from("process_types")
        .select("*")
        .eq("used_by_check", true)
        .eq("is_active", true)
        .in("creative_type", ["common", "video", "banner"])
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProcessTypeRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
