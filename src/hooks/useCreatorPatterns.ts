import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleCreatorRpcError } from "@/lib/creator-rpc-error";

export interface CreatorPattern {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export function useCreatorPatterns(shareToken: string | undefined) {
  const navigate = useNavigate();
  const [patterns, setPatterns] = useState<CreatorPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatterns = useCallback(async () => {
    if (!shareToken?.trim()) {
      setPatterns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_project_patterns_for_creator", {
        p_share_token: shareToken.trim(),
      });
      if (rpcError) throw rpcError;
      const list = Array.isArray(data) ? (data as CreatorPattern[]) : [];
      setPatterns(list);
    } catch (e: unknown) {
      if (handleCreatorRpcError(e, navigate)) {
        setPatterns([]);
        return;
      }
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "パターン一覧の取得に失敗しました";
      setError(msg);
      setPatterns([]);
    } finally {
      setLoading(false);
    }
  }, [navigate, shareToken]);

  useEffect(() => {
    void fetchPatterns();
  }, [fetchPatterns]);

  return { patterns, loading, error, refetch: fetchPatterns };
}
