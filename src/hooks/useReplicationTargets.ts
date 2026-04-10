import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReplicationTarget {
  id: string;
  product_name: string;
  product_code: string;
  process_type: string;
  created_at: string | null;
  input_type?: string;
  overall_status?: string | null;
}

interface Params {
  currentCheckResultId: string;
  productCode: string;
  processType: string;
  enabled?: boolean;
}

export const useReplicationTargets = ({
  currentCheckResultId,
  productCode,
  processType,
  enabled = true,
}: Params) => {
  return useQuery({
    queryKey: ["replication-targets", productCode, processType, currentCheckResultId],
    queryFn: async (): Promise<ReplicationTarget[]> => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("check_results")
        .select("id, product_name, product_code, process_type, created_at, input_type, overall_status")
        .eq("product_code", productCode)
        .eq("process_type", processType)
        .neq("id", currentCheckResultId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as ReplicationTarget[];
    },
    enabled: enabled && !!productCode && !!processType && !!currentCheckResultId,
    staleTime: 60 * 1000,
  });
};
