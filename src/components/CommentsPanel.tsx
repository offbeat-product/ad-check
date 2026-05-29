import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CommentRow, CommentWithDraftInfo } from "@/lib/db-types";
import { matchesCommentItemFilter, withDefaultDraftInfo } from "@/lib/comment-draft-info";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Pin, Paperclip, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import MentionInput, { type MentionMember } from "@/components/comments/MentionInput";
import { formatTimestamp } from "@/components/comments/TimestampBadge";
import { RichCommentCard, type CommentRole, type ReactionSummary } from "@/components/comments/RichCommentCard";
import { useCommentReactions } from "@/hooks/useCommentReactions";
import { ReplicateCommentDialog, type ReplicateCommentData } from "@/components/ReplicateCommentDialog";
import {
  COMMENT_ATTACHMENT_BUCKET,
  assertAttachmentSize,
  humanSize,
  isImage,
  normalizeAttachmentRows,
  type CommentAttachmentView,
} from "@/lib/comment-attachments";

interface CommentsPanelProps {
  checkResultId: string;
  filterItemId?: string | null;
  onAnnotationClick?: (annotationData: unknown) => void;
  onCheckItemClick?: (patternId: string) => void;
  mediaCurrentTime?: number | null;
  onSeekMedia?: (seconds: number) => void;
  /** Called after a comment is deleted (to refresh annotations etc.) */
  onCommentDeleted?: () => void;
  projectId?: string;
  processType?: string;
  productCode?: string;
  fileId?: string;
  onCommentCountChange?: (count: number) => void;
  /** File name to display on comments */
  fileName?: string;
  /** Increment to force a refetch of comments */
  refreshKey?: number;
}

type CommentsWithDraftInfoRpc = (
  fn: "get_comments_with_draft_info",
  args: { p_check_result_id: string },
) => Promise<{ data: CommentWithDraftInfo[] | null; error: { message: string } | null }>;

type CommentAttachmentsRpc = (
  fn: "get_comment_attachments_internal",
  args: { p_comment_ids: string[] },
) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;

type CommentAttachmentInsert = {
  comment_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

export default function CommentsPanel({ checkResultId, filterItemId, onAnnotationClick, onCheckItemClick, mediaCurrentTime, onSeekMedia, onCommentDeleted, projectId, processType, productCode, fileId, onCommentCountChange, fileName, refreshKey }: CommentsPanelProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentWithDraftInfo[]>([]);
  const [tab, setTab] = useState<"all" | "open" | "resolved">("all");
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [attachmentsByCommentId, setAttachmentsByCommentId] = useState<Record<string, CommentAttachmentView[]>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [replicateDialogComment, setReplicateDialogComment] = useState<ReplicateCommentData | null>(null);

  // Fetch workspace members for mentions
  useEffect(() => {
    supabase.from("workspace_members").select("id, user_id, email, role, status").eq("status", "accepted").not("user_id", "is", null).then(({ data }) => {
      if (!data) return;
      const memberList: MentionMember[] = data.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        display_name: m.email.split("@")[0],
        email: m.email,
      }));
      const userIds = data.filter((m) => m.user_id).map((m) => m.user_id!);
      if (userIds.length > 0) {
        supabase.rpc("get_profiles_by_ids", { p_ids: userIds }).then(({ data: profiles }) => {
          const profileMap: Record<string, string> = {};
          const activeUserIds = new Set<string>();
          (profiles ?? []).forEach((p: any) => {
            profileMap[p.id] = p.display_name || p.email?.split("@")[0] || "";
            activeUserIds.add(p.id);
          });
          setMembers(
            memberList
              .filter((m) => m.user_id && activeUserIds.has(m.user_id))
              .map((m) => ({ ...m, display_name: profileMap[m.user_id!] || m.display_name }))
          );
        });
      } else {
        setMembers([]);
      }
    });
  }, []);

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("check_result_id", checkResultId)
      .order("created_at", { ascending: true });
    if (handleSupabaseError(error, "comments")) return;

    let result: CommentWithDraftInfo[] = withDefaultDraftInfo((data ?? []) as CommentRow[]);

    try {
      const { data: draftData, error: rpcError } = await (
        supabase.rpc.bind(supabase) as unknown as CommentsWithDraftInfoRpc
      )("get_comments_with_draft_info", {
        p_check_result_id: checkResultId,
      });
      if (!rpcError && draftData && draftData.length > 0) {
        result = draftData.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
      } else if (rpcError) {
        console.warn("[get_comments_with_draft_info] using direct select fallback:", rpcError.message);
      }
    } catch (err) {
      console.warn("[get_comments_with_draft_info] using direct select fallback:", err);
    }

    await fetchAttachmentsForComments(result.map((comment) => comment.id));
    setComments(result);
    onCommentCountChange?.(result.length);
  };

  useEffect(() => { fetchComments(); }, [checkResultId, refreshKey]);

  // Realtime subscription — all members see new/updated/deleted comments instantly
  useEffect(() => {
    const channel = supabase
      .channel(`comments-${checkResultId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `check_result_id=eq.${checkResultId}` },
        () => { fetchComments(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [checkResultId]);

  const filtered = comments.filter((c) => {
    if (!matchesCommentItemFilter(c, filterItemId)) return false;
    if (tab === "open") return c.status === "open";
    if (tab === "resolved") return c.status === "resolved";
    return true;
  });

  const topLevel = filtered.filter((c) => !c.parent_id);
  const replies = (parentId: string) => filtered.filter((c) => c.parent_id === parentId);
  const { reactionsByCommentId, toggleReaction } = useCommentReactions({
    commentIds: filtered.map((c) => c.id),
    surface: "internal",
    reactorName: user?.email?.split("@")[0] || undefined,
  });

  const countByTab = (t: "all" | "open" | "resolved") => {
    const base = comments.filter((c) => matchesCommentItemFilter(c, filterItemId));
    if (t === "open") return base.filter((c) => c.status === "open").length;
    if (t === "resolved") return base.filter((c) => c.status === "resolved").length;
    return base.length;
  };

  const fetchAttachmentsForComments = async (commentIds: string[]) => {
    if (commentIds.length === 0) {
      setAttachmentsByCommentId({});
      return;
    }

    try {
      const { data, error } = await (
        supabase.rpc.bind(supabase) as unknown as CommentAttachmentsRpc
      )("get_comment_attachments_internal", {
        p_comment_ids: commentIds,
      });
      if (error) throw error;

      const rows = normalizeAttachmentRows(data ?? []);
      const rowsNeedingSignedUrl = rows.filter((row) => row.storage_path && !row.signed_url);
      const signedRows = await Promise.all(
        rowsNeedingSignedUrl.map(async (row) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from(COMMENT_ATTACHMENT_BUCKET)
            .createSignedUrl(row.storage_path!, 60 * 60);
          if (signedError || !signed?.signedUrl) return null;
          return { ...row, signed_url: signed.signedUrl };
        })
      );
      const signedByPath = new Map(
        signedRows
          .filter((row): row is CommentAttachmentView => row !== null)
          .map((row) => [row.storage_path, row])
      );
      const grouped: Record<string, CommentAttachmentView[]> = {};
      for (const row of rows) {
        const resolved = row.storage_path && signedByPath.has(row.storage_path) ? signedByPath.get(row.storage_path)! : row;
        if (!resolved.comment_id) continue;
        (grouped[resolved.comment_id] ??= []).push(resolved);
      }
      setAttachmentsByCommentId(grouped);
    } catch (err) {
      console.error("[get_comment_attachments_internal]", err);
      setAttachmentsByCommentId({});
    }
  };

  const uploadCommentAttachments = async (commentId: string, files: File[]) => {
    if (!user || files.length === 0) return;
    const rows: CommentAttachmentInsert[] = [];

    for (const file of files) {
      assertAttachmentSize(file);
      const ext = file.name.split(".").pop() || "bin";
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const storagePath = `${user.id}/${commentId}/${crypto.randomUUID()}-${safeName || `attachment.${ext}`}`;
      const { error: uploadError } = await supabase.storage
        .from(COMMENT_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      rows.push({
        comment_id: commentId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("comment_attachments" as never).insert(rows as never);
      if (error) throw error;
    }
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

  const sendMentionNotifications = async (content: string, userIds: string[]) => {
    if (!user || userIds.length === 0) return;
    const authorName = user.email?.split("@")[0] || "User";
    // Resolve project name for richer notification
    let projectName = "";
    const resolvedFileName = fileName || "";
    if (projectId) {
      const { data: proj } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
      projectName = proj?.name || "";
    }
    for (const uid of userIds) {
      await supabase.from("notifications").insert({
        user_id: uid,
        type: "mention",
        title: `${authorName}さんからメンションされました`,
        message: `[${projectName}] ${resolvedFileName}\n${content.slice(0, 100)}`,
        data: { check_result_id: checkResultId, project_id: projectId, file_id: fileId, project_name: projectName, file_name: resolvedFileName, author_name: authorName },
      });
    }
  };
  const handleSubmit = async () => {
    if ((!newComment.trim() && attachments.length === 0) || !user || uploading) return;
    setUploading(true);

    const timestampValue = (mediaCurrentTime != null && mediaCurrentTime > 0) ? mediaCurrentTime : null;

    try {
      const { data: insertedComment, error } = await supabase.from("comments").insert({
        check_result_id: checkResultId,
        check_item_id: filterItemId || null,
        author_name: user.email?.split("@")[0] || "User",
        author_email: user.email || "",
        content: newComment.trim(),
        status: "open",
        media_timestamp: timestampValue,
        mentions: mentionedUserIds.length > 0 ? mentionedUserIds : null,
      } as any).select("id").single();
      if (handleSupabaseError(error, "comment insert") || !insertedComment?.id) return;
      await uploadCommentAttachments(String(insertedComment.id), attachments);

      // Send mention notifications
      await sendMentionNotifications(newComment, mentionedUserIds);

      setNewComment("");
      setAttachments([]);
      setMentionedUserIds([]);
      await fetchComments();
    } catch (err) {
      console.error("[comment submit]", err);
      window.alert(err instanceof Error ? err.message : "コメントの投稿に失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if ((!replyText.trim() && replyAttachments.length === 0) || !user || uploading) return;
    const parent = comments.find((c) => c.id === parentId);
    setUploading(true);
    try {
      const { data: insertedReply, error } = await supabase.from("comments").insert({
        check_result_id: checkResultId,
        check_item_id: parent?.check_item_id || null,
        author_name: user.email?.split("@")[0] || "User",
        author_email: user.email || "",
        content: replyText.trim(),
        status: "open",
        parent_id: parentId,
      }).select("id").single();
      if (handleSupabaseError(error, "reply insert") || !insertedReply?.id) return;
      await uploadCommentAttachments(String(insertedReply.id), replyAttachments);
      setReplyTo(null);
      setReplyText("");
      setReplyAttachments([]);
      await fetchComments();
    } catch (err) {
      console.error("[reply insert]", err);
      window.alert(err instanceof Error ? err.message : "返信の投稿に失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const toggleStatus = async (id: string, current: string) => {
    const next = current === "open" ? "resolved" : "open";
    const { error } = await supabase.from("comments").update({ status: next }).eq("id", id);
    handleSupabaseError(error, "comment status");
    fetchComments();
  };

  const cleanupCommentAttachments = async (commentId: string) => {
    const storagePaths = (attachmentsByCommentId[commentId] ?? [])
      .map((attachment) => attachment.storage_path)
      .filter((path): path is string => Boolean(path));
    if (storagePaths.length > 0) {
      const { error } = await supabase.storage.from(COMMENT_ATTACHMENT_BUCKET).remove(storagePaths);
      if (error) console.warn("[comment attachment remove]", error.message);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectFiles(e.target.files, setAttachments);
    e.target.value = "";
  };

  const handleReplyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectFiles(e.target.files, setReplyAttachments);
    e.target.value = "";
  };

  const tabs = [
    { key: "all" as const, label: "全て" },
    { key: "open" as const, label: "未対応" },
    { key: "resolved" as const, label: "対応済" },
  ];

  const hasMediaTimestamp = mediaCurrentTime != null && mediaCurrentTime > 0;

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
            <CommentCard
              comment={c}
              onToggleStatus={() => toggleStatus(c.id, c.status)}
              onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
              onEdit={async (id, content) => {
                const { error } = await supabase.from("comments").update({ content }).eq("id", id);
                handleSupabaseError(error, "comment edit");
                fetchComments();
              }}
              onDelete={async (id) => {
                await cleanupCommentAttachments(id);
                const { error } = await supabase.from("comments").delete().eq("id", id);
                if (handleSupabaseError(error, "comment delete")) return;
                await fetchComments();
                onCommentDeleted?.();
              }}
              onAnnotationClick={onAnnotationClick}
              onCheckItemClick={onCheckItemClick}
              onSeekMedia={onSeekMedia}
              fileName={fileName}
              reactions={reactionsByCommentId[c.id]}
              onToggleReaction={(emoji) => void toggleReaction(c.id, emoji)}
              attachments={attachmentsByCommentId[c.id]}
              onReplicate={() => setReplicateDialogComment({
                id: c.id,
                content: c.content,
                author_name: c.author_name,
                author_email: c.author_email,
                status: c.status,
                attachment_url: c.attachment_url,
                attachment_type: c.attachment_type,
                attachment_name: c.attachment_name,
                mentions: c.mentions,
              })}
            />
            {replies(c.id).map((r) => (
              <div key={r.id} className="ml-5">
                <CommentCard
                  comment={r}
                  onToggleStatus={() => toggleStatus(r.id, r.status)}
                  onReply={() => {}}
                  onEdit={async (id, content) => {
                    const { error } = await supabase.from("comments").update({ content }).eq("id", id);
                    handleSupabaseError(error, "comment edit");
                    fetchComments();
                  }}
                  onDelete={async (id) => {
                    await cleanupCommentAttachments(id);
                    const { error } = await supabase.from("comments").delete().eq("id", id);
                    if (handleSupabaseError(error, "comment delete")) return;
                    await fetchComments();
                    onCommentDeleted?.();
                  }}
                  isReply
                  onSeekMedia={onSeekMedia}
                  reactions={reactionsByCommentId[r.id]}
                  onToggleReaction={(emoji) => void toggleReaction(r.id, emoji)}
                  attachments={attachmentsByCommentId[r.id]}
                />
              </div>
            ))}
            {replyTo === c.id && (
              <div className="ml-5 space-y-2">
                <div className="flex gap-2">
                  <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="返信を入力..." className="min-h-[50px] text-xs" />
                  <Button size="sm" onClick={() => handleReply(c.id)} disabled={uploading || (!replyText.trim() && replyAttachments.length === 0)} className="self-end h-8"><Send className="h-3 w-3" /></Button>
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

      <div className="border-t border-border p-3 shrink-0 space-y-2">
        {hasMediaTimestamp ? <div className="flex items-center gap-1.5 text-[10px] text-primary">
            🕐 再生位置 <span className="font-mono font-medium">{formatTimestamp(mediaCurrentTime!)}</span> をコメントに自動記録します
          </div> : null}
        <AttachmentPreview files={attachments} onRemove={(index) => removeSelectedFile(index, setAttachments)} />
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <MentionInput
              value={newComment}
              onChange={setNewComment}
              members={members}
              onMentions={setMentionedUserIds}
              placeholder="コメントを入力... (@でメンション)"
              className="min-h-[50px] text-xs"
              onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
            />
            <div className="flex items-center gap-1">
              <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            </div>
          </div>
          <Button size="icon" onClick={handleSubmit} disabled={uploading || (!newComment.trim() && attachments.length === 0)} className="self-end shrink-0 h-8 w-8">
            {uploading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <ReplicateCommentDialog
        open={replicateDialogComment !== null}
        onClose={() => setReplicateDialogComment(null)}
        comment={replicateDialogComment}
        currentCheckResultId={checkResultId}
        productCode={productCode || ""}
        processType={processType || ""}
      />
    </div>
  );
}

function CommentCard({ comment, onToggleStatus, onReply, onEdit, onDelete, isReply, onAnnotationClick, onCheckItemClick, onSeekMedia, fileName, onReplicate, reactions, onToggleReaction, attachments }: {
  comment: CommentWithDraftInfo; onToggleStatus: () => void; onReply: () => void; onEdit?: (id: string, content: string) => void; onDelete?: (id: string) => void; isReply?: boolean; onAnnotationClick?: (data: unknown) => void; onCheckItemClick?: (patternId: string) => void; onSeekMedia?: (seconds: number) => void; fileName?: string; onReplicate?: () => void; reactions?: ReactionSummary[]; onToggleReaction?: (emoji: string) => void; attachments?: CommentAttachmentView[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);

  const hasAnnotation = !!comment.annotation_data;
  const hasCheckItem = !!comment.check_item_id;
  const mediaTimestamp = comment.media_timestamp;
  const showDraftBadge = !comment.is_current_draft && !!comment.draft_label;
  const isInitialDraft = comment.draft_round === 0;
  const role: CommentRole = comment.creator_id ? "creator" : comment.guest_token ? "client" : "internal";
  const cardAttachments =
    attachments && attachments.length > 0
      ? attachments
      : comment.attachment_url
        ? [{
            file_name: comment.attachment_name ?? "添付ファイル",
            mime_type: comment.attachment_type ?? null,
            size_bytes: null,
            signed_url: comment.attachment_url,
          }]
        : [];

  const handleCardClick = () => {
    // Auto-seek video to annotation timestamp
    if (mediaTimestamp != null && mediaTimestamp > 0 && onSeekMedia) {
      onSeekMedia(mediaTimestamp);
    }
    if (hasAnnotation && onAnnotationClick) {
      onAnnotationClick(comment.annotation_data);
    } else if (hasCheckItem && onCheckItemClick) {
      onCheckItemClick(comment.check_item_id!);
    }
  };

  const isClickable = (hasAnnotation && onAnnotationClick) || (hasCheckItem && onCheckItemClick) || (mediaTimestamp != null && mediaTimestamp > 0 && onSeekMedia);

  const handleSaveEdit = () => {
    if (editText.trim() && onEdit) {
      onEdit(comment.id, editText.trim());
      setIsEditing(false);
    }
  };

  return (
    <RichCommentCard
      authorName={comment.author_name}
      role={role}
      createdAt={comment.created_at}
      status={comment.status}
      onToggleStatus={onToggleStatus}
      content={comment.content}
      mediaTimestamp={mediaTimestamp}
      onSeekMedia={onSeekMedia}
      attachments={cardAttachments}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
      onReply={!isReply ? onReply : undefined}
      onEdit={!isEditing ? () => setIsEditing(true) : undefined}
      onDelete={() => onDelete?.(comment.id)}
      onCopyToOtherFiles={!isReply ? onReplicate : undefined}
      isEditing={isEditing}
      editingText={editText}
      setEditingText={setEditText}
      onSubmitEdit={handleSaveEdit}
      onCancelEdit={() => { setIsEditing(false); setEditText(comment.content); }}
      isReply={isReply}
      isDimmed={!comment.is_current_draft}
      onCardClick={isClickable ? handleCardClick : undefined}
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
      metaSlot={fileName ? <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{fileName}</span>
        </div> : null}
      contentSlot={<>
        {hasAnnotation ? <div className="flex items-center gap-1 text-[10px] text-primary">
          <Pin className="h-3 w-3" />
          📌 画像上の指摘
          {onAnnotationClick ? <span className="text-muted-foreground ml-1">（クリックで表示）</span> : null}
        </div> : null}
        {!hasAnnotation && hasCheckItem && onCheckItemClick ? <div className="flex items-center gap-1 text-[10px] text-primary">
          🔍 チェック項目を表示（クリック）
        </div> : null}
      </>}
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
