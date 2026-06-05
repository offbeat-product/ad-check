import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleCreatorRpcError } from "@/lib/creator-rpc-error";
import {
  parseCreatorProjectPayload,
  parseCreatorProjectFilesPayload,
  parseCreatorProjectCommentsPayload,
  type CreatorProjectData,
  type CreatorProjectFile,
  type CreatorProjectComment,
} from "@/lib/creator-project-rpc";

export type { CreatorProjectData, CreatorProjectFile, CreatorProjectComment };

export function useCreatorProject(shareToken: string | undefined) {
  const navigate = useNavigate();
  const [project, setProject] = useState<CreatorProjectData | null>(null);
  const [files, setFiles] = useState<CreatorProjectFile[]>([]);
  const [comments, setComments] = useState<CreatorProjectComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!shareToken?.trim()) {
      setError("共有リンクが無効です");
      setProject(null);
      setFiles([]);
      setComments([]);
      setLoading(false);
      return;
    }

    const token = shareToken.trim();
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const [projectRes, filesRes, commentsRes] = await Promise.all([
        supabase.rpc("get_project_for_creator", { p_share_token: token }),
        supabase.rpc("get_project_files_for_creator", { p_share_token: token }),
        supabase.rpc("get_project_comments_for_creator", { p_share_token: token }),
      ]);

      if (projectRes.error) throw projectRes.error;
      if (filesRes.error) throw filesRes.error;
      if (commentsRes.error) throw commentsRes.error;

      const parsedProject = parseCreatorProjectPayload(projectRes.data);
      if (!parsedProject) {
        setError("この共有リンクは無効か、期限切れです");
        setProject(null);
        setFiles([]);
        setComments([]);
        return;
      }

      setProject(parsedProject);
      setFiles(parseCreatorProjectFilesPayload(filesRes.data));
      setComments(parseCreatorProjectCommentsPayload(commentsRes.data));
    } catch (e: unknown) {
      if (handleCreatorRpcError(e, navigate)) {
        setProject(null);
        setFiles([]);
        setComments([]);
        return;
      }
      console.error("[useCreatorProject] fetch error:", e);
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "データの取得に失敗しました";
      setError(msg);
      setProject(null);
      setFiles([]);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [navigate, shareToken]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!shareToken?.trim()) return;

    const channel = supabase
      .channel(`creator-project-comments-${shareToken.trim()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        () => {
          void fetchAll({ silent: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll, shareToken]);

  return { project, files, comments, loading, error, refetch: fetchAll };
}
