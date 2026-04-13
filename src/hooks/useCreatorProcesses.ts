import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CreatorProcess {
  id: string;
  process_key: string;
  process_label: string;
  sort_order: number;
  status: string;
  deadline: string | null;
  client_deadline: string | null;
  expected_width: number | null;
  expected_height: number | null;
  skip_size_check: boolean;
  is_common: boolean;
}

function normalizeProcesses(data: unknown): CreatorProcess[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      id: String(row.id ?? ""),
      process_key: String(row.process_key ?? ""),
      process_label: String(row.process_label ?? row.process_key ?? ""),
      sort_order: Number(row.sort_order ?? 0),
      status: String(row.status ?? "preparing"),
      deadline: row.deadline ? String(row.deadline) : null,
      client_deadline: row.client_deadline ? String(row.client_deadline) : null,
      expected_width: row.expected_width == null ? null : Number(row.expected_width),
      expected_height: row.expected_height == null ? null : Number(row.expected_height),
      skip_size_check: Boolean(row.skip_size_check),
      is_common: Boolean(row.is_common),
    }))
    .filter((p) => p.id && p.process_key)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function useCreatorProcesses(shareToken: string | undefined) {
  const [processes, setProcesses] = useState<CreatorProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!shareToken?.trim()) {
      setProcesses([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_project_processes_for_creator", {
        p_share_token: shareToken.trim(),
      });
      if (rpcError) throw rpcError;
      setProcesses(normalizeProcesses(data));
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "工程一覧の取得に失敗しました";
      setError(message);
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { processes, loading, error, refetch: fetch };
}
