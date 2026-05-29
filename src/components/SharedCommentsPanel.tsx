import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CommentRow, CommentWithDraftInfo } from "@/lib/db-types";
import { withDefaultDraftInfo } from "@/lib/comment-draft-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, FileText, Paperclip, Send, User, X } from "lucide-react";
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
import {
  buildCommentContentWithMediaTimestamp,
  isValidMediaTimestamp,
  resolveSeekSeconds,
} from "@/lib/comment-annotations";

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
  onAnnotationClick?: (data: unknown, commentId: string, mediaTimestamp?: number | null) => void;
  mediaCurrentTime?: number | null;
  onSeekMedia?: (seconds: number) => void;
  refreshKey?: number;
  onCommentCountChange?: (count: number) => void;
  selectedCommentId?: string | null;
  onSelectComment?: (commentId: string | null) => void;
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

interface ReplyTarget {
  rootId: string;
  targetId: string;
  toName: string;
}

export default function SharedCommentsPanel({
  checkResultId, shareToken, allowWrite,
  onAnnotationClick, mediaCurrentTime, onSeekMedia, refreshKey, onCommentCountChange,
  selectedCommentId: selectedCommentIdProp, onSelectComment: onSelectCommentProp,
}: SharedCommentsPanelProps) {
  const [comments, setComments] = useState<CommentWithDraftInfo[]>([]);
  const [guestName, setGuestName] = useState(() => localStorage.getItem("shared_guest_name") || "");
  const [guestEmail, setGuestEmail] = useState(() => localStorage.getItem("shared_guest_email") || "");
  const [showGuestForm, setShowGuestForm] = useState(() => !localStorage.getItem("shared_guest_name"));
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [replyText, setReplyText] = useState("");
  const [internalSelectedCommentId, setInternalSelectedCommentId] = useState<string | null>(null);
  const selectedCommentId = selectedCommentIdProp ?? internalSelectedCommentId;
  const setSelectedCommentId = onSelectCommentProp ?? setInternalSelectedCommentId;
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());
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

  // Realtime subscription keeps shared viewers in sync with internal/client comments.
  useEffect(() => {
    const channel = supabase
      .channel(`shared-comments-${checkResultId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `check_result_id=eq.${checkResultId}` },
        () => {
          void fetchComments();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [checkResultId, fetchComments]);

  // Fallback polling for environments where Realtime is delayed or unavailable.
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

  const toggleThread = (parentId: string) => {
    setOpenThreads((current) => {
      const next = new Set(current);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const openThread = (parentId: string) => {
    setOpenThreads((current) => {
      if (current.has(parentId)) return current;
      const next = new Set(current);
      next.add(parentId);
      return next;
    });
  };

  const startReply = (rootId: string, targetId: string, toName: string) => {
    openThread(rootId);
    setReplyTo((current) => current?.targetId === targetId ? null : { rootId, targetId, toName });
    setReplyText("");
    setReplyAttachments([]);
  };

  const postComment = async (content: string, files: File[], parentId?: string) => {
    setPosting(true);
    try {
      const uploadAttachments = files.length > 0 ? await filesToUploads(files) : [];
      const timestampValue =
        !parentId && isValidMediaTimestamp(mediaCurrentTime) ? mediaCurrentTime : null;
      const normalizedContent = buildCommentContentWithMediaTimestamp(content.trim(), timestampValue);
      const res = await invokeSharedComments("shared-comments", {
        body: {
          action: "create",
          share_token: shareToken,
          check_result_id: checkResultId,
          author_name: guestName.trim(),
          author_email: guestEmail.trim() || "shared@guest",
          content: normalizedContent,
          check_item_id: null,
          media_timestamp: null,
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

  const handleReply = async (parentId: string, rootParentId: string) => {
    if ((!replyText.trim() && replyAttachments.length === 0) || posting) return;
    await postComment(replyText.trim(), replyAttachments, parentId);
    openThread(rootParentId);
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
        {topLevel.map((c) => {
          const threadReplies = getReplies(c.id);
          const isThreadOpen = openThreads.has(c.id);

          return (
          <div key={c.id} className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <div className="p-3.5">
              <SharedCommentCard
                comment={c}
                onAnnotationClick={onAnnotationClick}
                onSeekMedia={onSeekMedia}
                selectedCommentId={selectedCommentId}
                onSelectComment={setSelectedCommentId}
                onReply={allowWrite ? () => startReply(c.id, c.id, c.author_name) : undefined}
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
            </div>
            {threadReplies.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleThread(c.id)}
                className="flex w-full items-center gap-1.5 border-t border-border/40 bg-muted/30 px-4 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted/50"
              >
                {isThreadOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {isThreadOpen ? "返信を隠す" : `返信 ${threadReplies.length}件を表示`}
              </button>
            ) : null}
            {isThreadOpen ? (
              <>
                {threadReplies.map((r) => (
                  <div key={r.id} className="border-l-2 border-t border-border/40 border-l-primary/20 bg-muted/60 px-4 py-2.5 pl-6">
                    <SharedCommentCard
                      comment={r}
                      onSeekMedia={onSeekMedia}
                      selectedCommentId={selectedCommentId}
                      onSelectComment={setSelectedCommentId}
                      onReply={allowWrite ? () => startReply(c.id, r.id, r.author_name) : undefined}
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
                {replyTo?.rootId === c.id && (
                  <div className="space-y-2 border-l-2 border-t border-border/40 border-l-primary/20 bg-muted/60 px-4 py-2.5 pl-6">
                    <p className="text-[11px] text-muted-foreground">{replyTo.toName}さんへ返信</p>
                    <div className="flex gap-2">
                      <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="返信を入力..." className="min-h-[50px] text-xs" />
                      <Button size="sm" onClick={() => handleReply(replyTo.targetId, replyTo.rootId)} disabled={posting || (!replyText.trim() && replyAttachments.length === 0)} className="self-end h-8">
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
              </>
            ) : null}
          </div>
          );
        })}
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
              {isValidMediaTimestamp(mediaCurrentTime) && (
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
  replyingToName, isOwn, isEditing, editingText, setEditingText, onStartEdit, onCancelEdit, onEdit, onDelete, reactions, onToggleReaction, attachments, selectedCommentId, onSelectComment,
}: {
  comment: CommentWithDraftInfo;
  onAnnotationClick?: (data: unknown, commentId: string, mediaTimestamp?: number | null) => void;
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
  selectedCommentId?: string | null;
  onSelectComment?: (commentId: string) => void;
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
      commentNumber={!isReply ? comment.comment_number : null}
      mediaTimestamp={comment.media_timestamp}
      onSeekMedia={(seconds) => {
        onSelectComment?.(comment.id);
        const seekSeconds = resolveSeekSeconds(comment.content, comment.media_timestamp) ?? seconds;
        onSeekMedia?.(seekSeconds);
        onAnnotationClick?.(comment.annotation_data, comment.id, seekSeconds);
      }}
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
      isSelected={selectedCommentId === comment.id}
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
      onCardClick={
        hasAnnotation || isValidMediaTimestamp(comment.media_timestamp) || resolveSeekSeconds(comment.content, comment.media_timestamp) != null
          ? () => {
              onSelectComment?.(comment.id);
              const seekSeconds = resolveSeekSeconds(comment.content, comment.media_timestamp);
              if (seekSeconds != null) onSeekMedia?.(seekSeconds);
              if (hasAnnotation) onAnnotationClick?.(comment.annotation_data, comment.id, seekSeconds);
              else if (seekSeconds != null) onAnnotationClick?.(comment.annotation_data, comment.id, seekSeconds);
            }
          : undefined
      }
      contentSlot={hasAnnotation ? <button onClick={(event) => {
          event.stopPropagation();
          onSelectComment?.(comment.id);
          onAnnotationClick?.(comment.annotation_data, comment.id, comment.media_timestamp);
        }} className="text-[10px] text-primary hover:underline">
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
