import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

interface CommentToReplicate {
  content: string;
  author_name: string;
  author_email: string;
  status: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  mentions?: string[] | null;
}

interface ReplicateInput {
  sourceComment: CommentToReplicate;
  targetCheckResultIds: string[];
}

export const useReplicateComment = () => {
  const queryClient = useQueryClient();

  return useMutation<number, Error, ReplicateInput>({
    mutationFn: async ({ sourceComment, targetCheckResultIds }) => {
      if (targetCheckResultIds.length === 0) {
        throw new Error("複製先を1つ以上選択してください");
      }

      const rows: TablesInsert<"comments">[] = targetCheckResultIds.map((targetId) => ({
        check_result_id: targetId,
        content: sourceComment.content,
        author_name: sourceComment.author_name,
        author_email: sourceComment.author_email,
        status: sourceComment.status,
        attachment_url: sourceComment.attachment_url ?? null,
        attachment_type: sourceComment.attachment_type ?? null,
        attachment_name: sourceComment.attachment_name ?? null,
        mentions: sourceComment.mentions ?? null,
        check_item_id: null,
        annotation_data: null,
        media_timestamp: null,
        parent_id: null,
      }));

      const { data, error } = await supabase
        .from("comments")
        .insert(rows)
        .select("id");

      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count}件のファイルにコメントを複製しました`);
      queryClient.invalidateQueries({ queryKey: ["comments"] });
    },
    onError: (err) => {
      toast.error(err.message || "コメントの複製に失敗しました");
    },
  });
};
