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
  file_name: string | null;
  version_number: number;
  parent_file_id: string | null;
  root_file_name: string | null;
}

interface Params {
  currentCheckResultId: string;
  productCode: string;
  processType: string;
  enabled?: boolean;
}

interface ReplicationTargetRow {
  id: string;
  file_name: string | null;
  version_number: number | null;
  parent_file_id: string | null;
  check_result_id: string | null;
  check_results: {
    id: string;
    product_name: string;
    product_code: string;
    process_type: string;
    created_at: string | null;
    input_type: string | null;
    overall_status: string | null;
  };
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
        .from("project_files")
        .select(`
          id,
          file_name,
          version_number,
          parent_file_id,
          check_result_id,
          check_results!inner (
            id,
            product_name,
            product_code,
            process_type,
            created_at,
            input_type,
            overall_status
          )
        `)
        .eq("check_results.product_code", productCode)
        .eq("check_results.process_type", processType)
        .neq("check_result_id", currentCheckResultId)
        .gte("check_results.created_at", thirtyDaysAgo.toISOString())
        .not("check_result_id", "is", null)
        .order("file_name", { ascending: true })
        .limit(100);

      if (error) throw error;

      const allFiles = (data ?? []) as ReplicationTargetRow[];

      const parentMap = new Map<string, string>();
      for (const f of allFiles) {
        if (!f.parent_file_id && f.id && f.file_name) {
          parentMap.set(f.id, f.file_name);
        }
      }

      const targets: ReplicationTarget[] = allFiles.map((f) => ({
        id: f.check_result_id!,
        file_name: f.file_name,
        version_number: f.version_number ?? 1,
        parent_file_id: f.parent_file_id,
        root_file_name: f.parent_file_id ? parentMap.get(f.parent_file_id) ?? null : null,
        product_name: f.check_results.product_name,
        product_code: f.check_results.product_code,
        process_type: f.check_results.process_type,
        created_at: f.check_results.created_at,
        input_type: f.check_results.input_type ?? undefined,
        overall_status: f.check_results.overall_status,
      }));

      targets.sort((a, b) => {
        const aRootName = a.parent_file_id
          ? (a.root_file_name ?? a.file_name)
          : a.file_name;
        const bRootName = b.parent_file_id
          ? (b.root_file_name ?? b.file_name)
          : b.file_name;
        const nameCompare = (aRootName ?? "").localeCompare(bRootName ?? "", "ja");
        if (nameCompare !== 0) return nameCompare;
        return (a.version_number ?? 1) - (b.version_number ?? 1);
      });

      return targets;
    },
    enabled: enabled && !!productCode && !!processType && !!currentCheckResultId,
    staleTime: 60 * 1000,
  });
};
