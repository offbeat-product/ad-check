import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectStatusSummary {
  project_id: string;
  project_name: string;
  project_code: string | null;
  deadline: string | null;
  overall_deadline: string | null;
  project_status: string | null;
  ob_pm: string | null;
  ob_am: string | null;
  ob_qm: string | null;
  product_id: string | null;
  product_name: string | null;
  client_id: string | null;
  client_name: string | null;
  total: number;
  count_uploaded: number;
  count_checking: number;
  count_checked: number;
  count_internal_revision: number;
  count_client_review: number;
  count_fixed: number;
  ready_for_cl_submit: number;
  ready_for_fix: number;
}

function num(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return String(v);
}

function parseRow(row: unknown): ProjectStatusSummary | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const project_id = r.project_id;
  if (typeof project_id !== "string" || !project_id) return null;
  return {
    project_id,
    project_name: typeof r.project_name === "string" ? r.project_name : "",
    project_code: str(r.project_code),
    deadline: str(r.deadline),
    overall_deadline: str(r.overall_deadline),
    project_status: str(r.project_status),
    ob_pm: str(r.ob_pm),
    ob_am: str(r.ob_am),
    ob_qm: str(r.ob_qm),
    product_id: str(r.product_id),
    product_name: str(r.product_name),
    client_id: str(r.client_id),
    client_name: str(r.client_name),
    total: num(r.total),
    count_uploaded: num(r.count_uploaded),
    count_checking: num(r.count_checking),
    count_checked: num(r.count_checked),
    count_internal_revision: num(r.count_internal_revision),
    count_client_review: num(r.count_client_review),
    count_fixed: num(r.count_fixed),
    ready_for_cl_submit: num(r.ready_for_cl_submit),
    ready_for_fix: num(r.ready_for_fix),
  };
}

export function useProjectStatusSummary() {
  const [data, setData] = useState<ProjectStatusSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: raw, error: rpcError } = await supabase.rpc("get_project_status_summary");
      if (rpcError) throw rpcError;
      const list = Array.isArray(raw) ? raw : [];
      const parsed = list.map(parseRow).filter((x): x is ProjectStatusSummary => x !== null);
      setData(parsed);
    } catch (e: unknown) {
      console.error("[useProjectStatusSummary] error:", e);
      const message =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "ステータスサマリーの取得に失敗しました";
      setError(message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { data, loading, error, refetch: fetchSummary };
}
