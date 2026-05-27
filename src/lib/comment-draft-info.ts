import type { CommentRow, CommentWithDraftInfo } from "@/lib/db-types";

/** RPC 未デプロイ時のフォールバック用デフォルト稿情報 */
export function withDefaultDraftInfo(comments: CommentRow[]): CommentWithDraftInfo[] {
  return comments.map((comment) => ({
    ...comment,
    draft_round: 0,
    draft_label: "初稿",
    is_current_draft: true,
  }));
}

/** 画像全体コメント (check_item_id IS NULL) は filter 未指定時のみ表示 */
export function matchesCommentItemFilter(
  comment: Pick<CommentRow, "check_item_id">,
  filterItemId?: string | null,
): boolean {
  if (!filterItemId) return true;
  return comment.check_item_id === filterItemId;
}
