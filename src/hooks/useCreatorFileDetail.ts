import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CreatorFileComment {
  id: string;
  content: string;
  author_name: string;
  status: string;
  created_at: string;
  media_timestamp: number | null;
  annotation_data: unknown | null;
  parent_id: string | null;
  creator_id: string | null;
  file_id: string;
  file_name: string;
  process_type: string;
  version_number: number;
}

function normalizeComments(data: unknown): CreatorFileComment[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      id: String(row.id ?? ""),
      content: String(row.content ?? row.comment_text ?? ""),
      author_name: String(row.author_name ?? row.created_by_name ?? "担当者"),
      status: String(row.status ?? "open"),
      created_at: String(row.created_at ?? ""),
      media_timestamp:
        row.media_timestamp == null || Number.isNaN(Number(row.media_timestamp))
          ? null
          : Number(row.media_timestamp),
      annotation_data: row.annotation_data ?? null,
      parent_id: row.parent_id == null ? null : String(row.parent_id),
      creator_id: row.creator_id == null ? null : String(row.creator_id),
      file_id: String(row.file_id ?? ""),
      file_name: String(row.file_name ?? ""),
      process_type: String(row.process_type ?? ""),
      version_number: Number(row.version_number ?? 1),
    }))
    .filter((c) => c.id);
}

export function useCreatorFileComments(shareToken: string | undefined, fileId: string | undefined) {
  const [comments, setComments] = useState<CreatorFileComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!shareToken?.trim() || !fileId?.trim()) {
      setComments([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc.bind(supabase)("get_project_comments_for_creator", {
        p_share_token: shareToken.trim(),
        p_file_id: fileId.trim(),
      });
      if (rpcError) throw rpcError;
      setComments(normalizeComments(data));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "コメントの取得に失敗しました";
      setError(msg);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [shareToken, fileId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { comments, loading, error, refetch: fetch };
}
