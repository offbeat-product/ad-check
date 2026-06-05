import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleCreatorRpcError } from "@/lib/creator-rpc-error";

export type CommentCountMap = Record<string, number>;

export function useCreatorCommentCounts(shareToken: string | undefined) {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<CommentCountMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    if (!shareToken?.trim()) {
      setCounts({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_file_comment_counts_for_creator", {
        p_share_token: shareToken.trim(),
      });
      if (rpcError) throw rpcError;
      setCounts((data as CommentCountMap) || {});
    } catch (e: unknown) {
      if (handleCreatorRpcError(e, navigate)) {
        setCounts({});
        return;
      }
      console.error("[useCreatorCommentCounts] error:", e);
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "コメント数の取得に失敗しました";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [navigate, shareToken]);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  return { counts, loading, error, refetch: fetchCounts };
}
