import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CommentRow, CommentWithDraftInfo } from "@/lib/db-types";
import { withDefaultDraftInfo } from "@/lib/comment-draft-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Paperclip, Send, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichCommentCard, type CommentRole, type ReactionSummary } from "@/components/comments/RichCommentCard";
import { useCommentReactions } from "@/hooks/useCommentReactions";
import {
  assertAttachmentSize,
  filesToUploads,
  humanSize,
  isImage,
  normalizeAttachmentRows,
  type CommentAttachmentView,
} from "@/lib/comment-attachments";

const GUEST_TOKEN_KEY = "ad_check_shared_guest_token";

function getOrCreateGuestToken(): string {
  try {
    let token = localStorage.getItem(GUEST_TOKEN_KEY);
    if (!token) {
      token = `guest_${crypto.randomUUID()}`;
      localStorage.setItem(GUEST_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return `guest_ephemeral_${Math.random().toString(36).slice(2)}`;
  }
}

interface SharedCommentsPanelProps {
  checkResultId: string;
  shareToken: string;
  allowWrite: boolean;
  onAnnotationClick?: (data: unknown) => void;
  mediaCurrentTime?: number | null;
  onSeekMedia?: (seconds: number) => void;
  refreshKey?: number;
  onCommentCountChange?: (count: number) => void;
}

type SharedCommentsWithDraftRpc = (
  fn: "get_shared_comments_with_draft_info",
  args: { p_check_result_id: string; p_share_token: string },
) => Promise<{ data: CommentWithDraftInfo[] | null; error: { message: string } | null }>;

type SharedCommentsRpc = (
  fn: "get_shared_comments",
  args: { p_check_result_id: string; p_share_token: string },
) => Promise<{ data: CommentRow[] | null; error: { message: string } | null }>;

type SharedCommentsInvoke = (
  fn: "shared-comments",
  options: { body: Record<string, unknown> }
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export default function SharedCommentsPanel({
  checkResultId, shareToken, allowWrite,
  onAnnotationClick, mediaCurrentTime, onSeekMedia, refreshKey, onCommentCountChange,
}: SharedCommentsPanelProps) {
  const [comments, setComments] = useState<CommentWithDraftInfo[]>([]);
  const [guestName, setGuestName] = useState(() => localStorage.getItem("shared_guest_name") || "");
  const [guestEmail, setGuestEmail] = useState(() => localStorage.getItem("shared_guest_email") || "");
  const [showGuestForm, setShowGuestForm] = useState(() => !localStorage.getItem("shared_guest_name"));
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [tab, setTab] = useState<"all" | "open" | "resolved">("all");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [attachmentsByCommentId, setAttachmentsByCommentId] = useState<Record<string, CommentAttachmentView[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const guestToken = useMemo(() => getOrCreateGuestToken(), []);
  const invokeSharedComments = useMemo(
    () => supabase.functions.invoke.bind(supabase.functions) as unknown as SharedCommentsInvoke,
    []
  );

  const fetchAttachmentUrls = useCallback(async (commentIds: string[]) => {
    if (commentIds.length === 0) {
      setAttachmentsByCommentId({});
      return;
    }

    try {
      const { data, error } = await invokeSharedComments("shared-comments", {
        body: {
          action: "get_attachment_urls",
          share_token: shareToken,
          comment_ids: commentIds,
        },
      });
      if (error) throw error;
      const rows = normalizeAttachmentRows(Array.isArray(data) ? data : (data as { attachments?: unknown[] } | null)?.attachments);
      const grouped: Record<string, CommentAttachmentView[]> = {};
      for (const row of rows) {
        if (!row.comment_id) continue;
        (grouped[row.comment_id] ??= []).push(row);
      }
      setAttachmentsByCommentId(grouped);
    } catch (err) {
      console.error("[shared attachment urls]", err);
      setAttachmentsByCommentId({});
    }
  }, [invokeSharedComments, shareToken]);

  const fetchComments = useCallback(async () => {
    let result: CommentWithDraftInfo[] = [];

    try {
      const { data: draftData, error: draftError } = await (
        supabase.rpc.bind(supabase) as unknown as SharedCommentsWithDraftRpc
      )("get_shared_comments_with_draft_info", {
        p_check_result_id: checkResultId,
        p_share_token: shareToken,
      });
      if (!draftError && draftData != null) {
        result = draftData;
      } else {
        if (draftError) {
          console.warn("[get_shared_comments_with_draft_info] using legacy RPC fallback:", draftError.message);
        }
        const { data, error } = await (
          supabase.rpc.bind(supabase) as unknown as SharedCommentsRpc
        )("get_shared_comments", {
          p_check_result_id: checkResultId,
          p_share_token: shareToken,
        });
        if (error) {
          console.error("[get_shared_comments]", error.message);
          return;
        }
        result = withDefaultDraftInfo((data ?? []) as CommentRow[]);
      }
    } catch (err) {
      console.error("[shared comments fetch]", err);
      return;
    }

    const sorted = result.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    await fetchAttachmentUrls(sorted.map((comment) => comment.id));
    setComments(sorted);
    onCommentCountChange?.(sorted.length);
  }, [checkResultId, fetchAttachmentUrls, shareToken, onCommentCountChange]);

  useEffect(() => { fetchComments(); }, [fetchComments, refreshKey]);

  // Poll for new comments every 15s
  useEffect(() => {
    const interval = setInterval(fetchComments, 15000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  const filtered = comments.filter((c) => {
    if (tab === "open") return c.status === "open";
    if (tab === "resolved") return c.status === "resolved";
    return true;
  });

  const topLevel = filtered.filter((c) => !c.parent_id);
  const getReplies = (parentId: string) => filtered.filter((c) => c.parent_id === parentId);
  const { reactionsByCommentId, toggleReaction } = useCommentReactions({
    commentIds: filtered.map((c) => c.id),
    surface: "shared",
    shareToken,
    guestToken,
    reactorName: guestName.trim() || "ゲスト",
  });

  const countByTab = (t: "all" | "open" | "resolved") => {
    if (t === "open") return comments.filter((c) => c.status === "open").length;
    if (t === "resolved") return comments.filter((c) => c.status === "resolved").length;
    return comments.length;
  };

  const handleSaveGuest = () => {
    if (!guestName.trim()) return;
    localStorage.setItem("shared_guest_name", guestName.trim());
    if (guestEmail.trim()) localStorage.setItem("shared_guest_email", guestEmail.trim());
    setShowGuestForm(false);
  };

  const postComment = async (content: string, files: File[], parentId?: string) => {
    setPosting(true);
    try {
      const uploadAttachments = files.length > 0 ? await filesToUploads(files) : [];
      const res = await invokeSharedComments("shared-comments", {
        body: {
          action: "create",
          share_token: shareToken,
          check_result_id: checkResultId,
          author_name: guestName.trim(),
          author_email: guestEmail.trim() || "shared@guest",
          content,
          check_item_id: null,
          media_timestamp: (!parentId && mediaCurrentTime != null && mediaCurrentTime > 0) ? mediaCurrentTime : null,
          parent_id: parentId || null,
          guest_token: guestToken,
          attachments: uploadAttachments,
        },
      });
      if (res.error) console.error("[shared-comments]", res.error);
      await fetchComments();
    } catch (err) {
      console.error("[shared-comments] error:", err);
    }
    setPosting(false);
  };

  const selectFiles = (files: FileList | null, setter: React.Dispatch<React.SetStateAction<File[]>>) => {
    if (!files) return;
    const nextFiles = Array.from(files);
    try {
      nextFiles.forEach(assertAttachmentSize);
      setter((current) => [...current, ...nextFiles]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "添付ファイルの選択に失敗しました");
    }
  };

  const removeSelectedFile = (index: number, setter: React.Dispatch<React.SetStateAction<File[]>>) => {
    setter((current) => current.filter((_, i) => i !== index));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    selectFiles(event.target.files, setAttachments);
    event.target.value = "";
  };

  const handleReplyFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    selectFiles(event.target.files, setReplyAttachments);
    event.target.value = "";
  };

  const startEdit = (comment: CommentWithDraftInfo) => {
    setEditingId(comment.id);
    setEditingText(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const handleEdit = async (commentId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    try {
      const { error } = await invokeSharedComments("shared-comments", {
        body: {
          action: "update",
          share_token: shareToken,
          comment_id: commentId,
          guest_token: guestToken,
          content: trimmed,
        },
      });
      if (error) throw error;
      cancelEdit();
      await fetchComments();
    } catch (err) {
      console.error("[shared comment edit]", err);
      window.alert("編集に失敗しました。自分が投稿したコメントのみ編集できます。");
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm("このコメントを削除しますか？")) return;
    try {
      const { error } = await invokeSharedComments("shared-comments", {
        body: {
          action: "delete",
          share_token: shareToken,
          comment_id: commentId,
          guest_token: guestToken,
        },
      });
      if (error) throw error;
      await fetchComments();
    } catch (err) {
      console.error("[shared comment delete]", err);
      window.alert("削除に失敗しました。自分が投稿したコメントのみ削除できます。");
    }
  };

  const handleSubmit = async () => {
    if ((!newComment.trim() && attachments.length === 0) || posting) return;
    await postComment(newComment.trim(), attachments);
    setNewComment("");
    setAttachments([]);
  };

  const handleReply = async (parentId: string) => {
    if ((!replyText.trim() && replyAttachments.length === 0) || posting) return;
    await postComment(replyText.trim(), replyAttachments, parentId);
    setReplyTo(null);
    setReplyText("");
    setReplyAttachments([]);
  };

  const tabs: { key: "all" | "open" | "resolved"; label: string }[] = [
    { key: "all", label: "全て" },
    { key: "open", label: "未対応" },
    { key: "resolved", label: "対応済" },
  ];

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t.label}<span className="ml-1 opacity-70">({countByTab(t.key)})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {topLevel.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">コメントはまだありません</p>
        )}
        {topLevel.map((c) => (
          <div key={c.id} className="space-y-2">
            <SharedCommentCard
              comment={c}
              onAnnotationClick={onAnnotationClick}
              onSeekMedia={onSeekMedia}
              onReply={allowWrite ? () => setReplyTo(replyTo === c.id ? null : c.id) : undefined}
              isOwn={c.guest_token != null && c.guest_token === guestToken}
              isEditing={editingId === c.id}
              editingText={editingText}
              setEditingText={setEditingText}
              onStartEdit={() => startEdit(c)}
              onCancelEdit={cancelEdit}
              onEdit={() => handleEdit(c.id, editingText)}
              onDelete={() => handleDelete(c.id)}
              reactions={reactionsByCommentId[c.id]}
              onToggleReaction={(emoji) => void toggleReaction(c.id, emoji)}
              attachments={attachmentsByCommentId[c.id]}
            />
            {getReplies(c.id).map((r) => (
              <div key={r.id} className="ml-6 mt-2 space-y-2 border-l-2 border-primary/20 pl-3">
                <SharedCommentCard
                  comment={r}
                  onSeekMedia={onSeekMedia}
                  isReply
                  isOwn={r.guest_token != null && r.guest_token === guestToken}
                  isEditing={editingId === r.id}
                  editingText={editingText}
                  setEditingText={setEditingText}
                  onStartEdit={() => startEdit(r)}
                  onCancelEdit={cancelEdit}
                  onEdit={() => handleEdit(r.id, editingText)}
                  onDelete={() => handleDelete(r.id)}
                  reactions={reactionsByCommentId[r.id]}
                  onToggleReaction={(emoji) => void toggleReaction(r.id, emoji)}
                  attachments={attachmentsByCommentId[r.id]}
                  replyingToName={c.author_name}
                />
              </div>
            ))}
            {replyTo === c.id && (
              <div className="ml-5 space-y-2">
                <div className="flex gap-2">
                  <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="返信を入力..." className="min-h-[50px] text-xs" />
                  <Button size="sm" onClick={() => handleReply(c.id)} disabled={posting || (!replyText.trim() && replyAttachments.length === 0)} className="self-end h-8">
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
                <AttachmentPreview files={replyAttachments} onRemove={(index) => removeSelectedFile(index, setReplyAttachments)} />
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => replyFileInputRef.current?.click()} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  <input ref={replyFileInputRef} type="file" multiple className="hidden" onChange={handleReplyFileSelect} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {allowWrite ? <div className="border-t border-border p-3 shrink-0 space-y-2">
          {showGuestForm ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">コメントするにはお名前を入力してください</p>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="お名前 *" className="text-xs" />
              <Input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="メールアドレス（任意）" className="text-xs" />
              <Button size="sm" onClick={handleSaveGuest} disabled={!guestName.trim()} className="w-full text-xs">
                <User className="h-3 w-3 mr-1" />設定して投稿を開始
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <User className="h-3 w-3" />{guestName}
                <button onClick={() => setShowGuestForm(true)} className="text-primary underline">変更</button>
              </div>
              {mediaCurrentTime != null && mediaCurrentTime > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-primary">
                  🕐 再生位置をコメントに自動記録します
                </div>
              )}
              <AttachmentPreview files={attachments} onRemove={(index) => removeSelectedFile(index, setAttachments)} />
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="コメントを入力..."
                    className="min-h-[50px] text-xs"
                    onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
                  />
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Paperclip className="h-3.5 w-3.5" />
                    </button>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                  </div>
                </div>
                <Button size="icon" onClick={handleSubmit} disabled={posting || (!newComment.trim() && attachments.length === 0)} className="self-end shrink-0 h-8 w-8">
                  {posting ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </>
          )}
        </div> : null}
    </div>
  );
}

function SharedCommentCard({
  comment, onAnnotationClick, onSeekMedia, onReply, isReply,
  replyingToName, isOwn, isEditing, editingText, setEditingText, onStartEdit, onCancelEdit, onEdit, onDelete, reactions, onToggleReaction, attachments,
}: {
  comment: CommentWithDraftInfo;
  onAnnotationClick?: (data: unknown) => void;
  onSeekMedia?: (seconds: number) => void;
  onReply?: () => void;
  isReply?: boolean;
  replyingToName?: string;
  isOwn?: boolean;
  isEditing?: boolean;
  editingText?: string;
  setEditingText?: (value: string) => void;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  reactions?: ReactionSummary[];
  onToggleReaction?: (emoji: string) => void;
  attachments?: CommentAttachmentView[];
}) {
  const hasAnnotation = !!comment.annotation_data;
  const showDraftBadge = !comment.is_current_draft && !!comment.draft_label;
  const isInitialDraft = comment.draft_round === 0;
  const role: CommentRole = comment.creator_id ? "creator" : comment.guest_token ? "client" : "internal";

  return (
    <RichCommentCard
      authorName={comment.author_name}
      role={role}
      createdAt={comment.created_at}
      status={comment.status}
      content={comment.content}
      mediaTimestamp={comment.media_timestamp}
      onSeekMedia={onSeekMedia}
      attachments={attachments}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
      onReply={onReply}
      onEdit={isOwn && !isEditing ? onStartEdit : undefined}
      onDelete={isOwn ? onDelete : undefined}
      isEditing={isEditing}
      editingText={editingText}
      setEditingText={setEditingText}
      onSubmitEdit={onEdit}
      onCancelEdit={onCancelEdit}
      isReply={isReply}
      replyingToName={replyingToName}
      isDimmed={!comment.is_current_draft}
      headerSlot={showDraftBadge ? (
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                isInitialDraft
                  ? "border-muted-foreground/20 bg-muted text-muted-foreground"
                  : "border-blue-200 bg-blue-50 text-blue-700"
              )}
            >
              {comment.draft_label}
            </span>
          ) : null}
      contentSlot={hasAnnotation ? <button onClick={() => onAnnotationClick?.(comment.annotation_data)} className="text-[10px] text-primary hover:underline">
          📌 アノテーションを表示
        </button> : null}
    />
  );
}

function AttachmentPreview({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file, index) => {
        const previewUrl = isImage(file.type) ? URL.createObjectURL(file) : null;
        return (
          <div key={`${file.name}-${file.size}-${index}`} className="flex max-w-full items-center gap-2 rounded-md bg-muted p-2">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-10 w-10 rounded object-cover" onLoad={() => URL.revokeObjectURL(previewUrl)} />
            ) : (
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="truncate text-xs text-foreground">{file.name}</p>
              <p className="text-[10px] text-muted-foreground">{humanSize(file.size)}</p>
            </div>
            <button type="button" onClick={() => onRemove(index)} className="shrink-0">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
