import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tusUpload } from "@/lib/tus-upload";
import { useAuth } from "@/hooks/useAuth";
import type { CommentRow, CommentWithDraftInfo } from "@/lib/db-types";
import { matchesCommentItemFilter, withDefaultDraftInfo } from "@/lib/comment-draft-info";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Pin, Reply, Paperclip, X, FileText, Pencil, Trash2, Check, Copy, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import MentionInput, { type MentionMember } from "@/components/comments/MentionInput";
import TimestampBadge, { formatTimestamp } from "@/components/comments/TimestampBadge";
import { ReplicateCommentDialog, type ReplicateCommentData } from "@/components/ReplicateCommentDialog";

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

export default function CommentsPanel({ checkResultId, filterItemId, onAnnotationClick, onCheckItemClick, mediaCurrentTime, onSeekMedia, onCommentDeleted, projectId, processType, productCode, fileId, onCommentCountChange, fileName, refreshKey }: CommentsPanelProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentWithDraftInfo[]>([]);
  const [tab, setTab] = useState<"all" | "open" | "resolved">("all");
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [attachment, setAttachment] = useState<{ file: File; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      const rpc = supabase.rpc as unknown as CommentsWithDraftInfoRpc;
      const { data: draftData, error: rpcError } = await rpc("get_comments_with_draft_info", {
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

  const countByTab = (t: "all" | "open" | "resolved") => {
    const base = comments.filter((c) => matchesCommentItemFilter(c, filterItemId));
    if (t === "open") return base.filter((c) => c.status === "open").length;
    if (t === "resolved") return base.filter((c) => c.status === "resolved").length;
    return base.length;
  };

  const uploadAttachment = async (file: File): Promise<{ url: string; type: string; name: string } | null> => {
    if (!user) return null;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/${checkResultId}/${Date.now()}.${ext}`;
    try {
      await tusUpload({ bucketName: "comment-attachments", path, file, contentType: file.type, upsert: false });
    } catch (e) { console.error("[storage upload]", e); return null; }
    const { data: urlData, error: signError } = await supabase.storage
      .from("comment-attachments")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signError || !urlData?.signedUrl) { console.error("[signed url]", signError?.message); return null; }
    return { url: urlData.signedUrl, type: file.type, name: file.name };
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
    if (!newComment.trim() || !user) return;
    setUploading(true);

    let attachmentData: Record<string, string> = {};
    if (attachment) {
      const result = await uploadAttachment(attachment.file);
      if (result) {
        attachmentData = { attachment_url: result.url, attachment_type: result.type, attachment_name: result.name };
      }
    }

    const timestampValue = (mediaCurrentTime != null && mediaCurrentTime > 0) ? mediaCurrentTime : null;

    const { error } = await supabase.from("comments").insert({
      check_result_id: checkResultId,
      check_item_id: filterItemId || null,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: newComment,
      status: "open",
      media_timestamp: timestampValue,
      mentions: mentionedUserIds.length > 0 ? mentionedUserIds : null,
      ...attachmentData,
    } as any);
    handleSupabaseError(error, "comment insert");

    // Send mention notifications
    await sendMentionNotifications(newComment, mentionedUserIds);

    setNewComment("");
    setAttachment(null);
    setMentionedUserIds([]);
    setUploading(false);
    fetchComments();
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim() || !user) return;
    const parent = comments.find((c) => c.id === parentId);
    const { error } = await supabase.from("comments").insert({
      check_result_id: checkResultId,
      check_item_id: parent?.check_item_id || null,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: replyText,
      status: "open",
      parent_id: parentId,
    });
    handleSupabaseError(error, "reply insert");
    setReplyTo(null);
    setReplyText("");
    fetchComments();
  };

  const toggleStatus = async (id: string, current: string) => {
    const next = current === "open" ? "resolved" : "open";
    const { error } = await supabase.from("comments").update({ status: next }).eq("id", id);
    handleSupabaseError(error, "comment status");
    fetchComments();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    setAttachment({ file, preview });
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "たった今";
    if (mins < 60) return `${mins}分前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}時間前`;
    return `${Math.floor(hrs / 24)}日前`;
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
              currentUserEmail={user?.email || ""}
              onToggleStatus={() => toggleStatus(c.id, c.status)}
              onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
              onEdit={async (id, content) => {
                const { error } = await supabase.from("comments").update({ content }).eq("id", id);
                handleSupabaseError(error, "comment edit");
                fetchComments();
              }}
              onDelete={async (id) => {
                const { error } = await supabase.from("comments").delete().eq("id", id);
                if (handleSupabaseError(error, "comment delete")) return;
                await fetchComments();
                onCommentDeleted?.();
              }}
              timeAgo={timeAgo}
              onAnnotationClick={onAnnotationClick}
              onCheckItemClick={onCheckItemClick}
              onSeekMedia={onSeekMedia}
              fileName={fileName}
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
                  currentUserEmail={user?.email || ""}
                  onToggleStatus={() => toggleStatus(r.id, r.status)}
                  onReply={() => {}}
                  onEdit={async (id, content) => {
                    const { error } = await supabase.from("comments").update({ content }).eq("id", id);
                    handleSupabaseError(error, "comment edit");
                    fetchComments();
                  }}
                  onDelete={async (id) => {
                    const { error } = await supabase.from("comments").delete().eq("id", id);
                    if (handleSupabaseError(error, "comment delete")) return;
                    await fetchComments();
                    onCommentDeleted?.();
                  }}
                  timeAgo={timeAgo}
                  isReply
                  onSeekMedia={onSeekMedia}
                />
              </div>
            ))}
            {replyTo === c.id && (
              <div className="ml-5 flex gap-2">
                <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="返信を入力..." className="min-h-[50px] text-xs" />
                <Button size="sm" onClick={() => handleReply(c.id)} className="self-end h-8"><Send className="h-3 w-3" /></Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3 shrink-0 space-y-2">
        {hasMediaTimestamp ? <div className="flex items-center gap-1.5 text-[10px] text-primary">
            🕐 再生位置 <span className="font-mono font-medium">{formatTimestamp(mediaCurrentTime!)}</span> をコメントに自動記録します
          </div> : null}
        {attachment ? <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
            {attachment.preview ? (
              <img src={attachment.preview} alt="" className="w-10 h-10 rounded object-cover" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground truncate flex-1">{attachment.file.name}</span>
            <button onClick={() => setAttachment(null)}><X className="h-3 w-3 text-muted-foreground" /></button>
          </div> : null}
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
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.ai,.psd,.mp4" onChange={handleFileSelect} />
            </div>
          </div>
          <Button size="icon" onClick={handleSubmit} disabled={uploading} className="self-end shrink-0 h-8 w-8">
            <Send className="h-3.5 w-3.5" />
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

function CommentCard({ comment, currentUserEmail, onToggleStatus, onReply, onEdit, onDelete, timeAgo, isReply, onAnnotationClick, onCheckItemClick, onSeekMedia, fileName, onReplicate }: {
  comment: CommentWithDraftInfo; currentUserEmail: string; onToggleStatus: () => void; onReply: () => void; onEdit?: (id: string, content: string) => void; onDelete?: (id: string) => void; timeAgo: (d: string) => string; isReply?: boolean; onAnnotationClick?: (data: unknown) => void; onCheckItemClick?: (patternId: string) => void; onSeekMedia?: (seconds: number) => void; fileName?: string; onReplicate?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwn = currentUserEmail === comment.author_email;
  const initial = comment.author_name.charAt(0).toUpperCase();
  const colors = ["bg-primary", "bg-status-ok", "bg-context-client", "bg-product-cta"];
  const colorIdx = comment.author_name.charCodeAt(0) % colors.length;
  const hasAnnotation = !!comment.annotation_data;
  const hasCheckItem = !!comment.check_item_id;
  const mediaTimestamp = comment.media_timestamp;
  const showDraftBadge = !comment.is_current_draft && !!comment.draft_label;
  const isInitialDraft = comment.draft_round === 0;

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

  const renderContent = (text: string) => {
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="text-primary font-semibold underline decoration-primary/40 cursor-default">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const handleSaveEdit = () => {
    if (editText.trim() && onEdit) {
      onEdit(comment.id, editText.trim());
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [menuOpen]);

  return (
    <div
      className={cn(
        "border border-border rounded-lg p-2.5 space-y-1.5 bg-card transition-colors",
        isClickable && "cursor-pointer hover:border-primary/40 hover:bg-primary/5",
        !comment.is_current_draft && "opacity-75"
      )}
      onClick={isClickable ? handleCardClick : undefined}
    >
      <div className="flex items-center gap-2">
        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white", colors[colorIdx])}>{initial}</div>
        <span className="text-xs font-medium flex-1">{comment.author_name}</span>
        {showDraftBadge ? (
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
        {mediaTimestamp != null && mediaTimestamp > 0 && (
          <TimestampBadge seconds={mediaTimestamp} onClick={onSeekMedia ? () => onSeekMedia(mediaTimestamp) : undefined} />
        )}
        <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
      </div>
      {fileName ? <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{fileName}</span>
        </div> : null}

      {isEditing ? (
        <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[50px] text-xs" autoFocus />
          <div className="flex gap-1.5">
            <Button size="sm" variant="default" onClick={handleSaveEdit} className="h-6 text-[10px] px-2">
              <Check className="h-3 w-3 mr-1" />保存
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setEditText(comment.content); }} className="h-6 text-[10px] px-2">
              キャンセル
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs whitespace-pre-wrap">{renderContent(comment.content)}</p>
      )}

      {hasAnnotation ? <div className="flex items-center gap-1 text-[10px] text-primary">
          <Pin className="h-3 w-3" />
          📌 画像上の指摘
          {onAnnotationClick ? <span className="text-muted-foreground ml-1">（クリックで表示）</span> : null}
        </div> : null}
      {!hasAnnotation && hasCheckItem && onCheckItemClick ? <div className="flex items-center gap-1 text-[10px] text-primary">
          🔍 チェック項目を表示（クリック）
        </div> : null}
      {comment.attachment_url ? <a href={comment.attachment_url} target="_blank" rel="noopener noreferrer" className="block" onClick={(e) => e.stopPropagation()}>
          {comment.attachment_type?.startsWith("image/") ? (
            <img src={comment.attachment_url} alt={comment.attachment_name ?? ""} className="max-h-20 rounded border border-border" />
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-primary hover:underline">
              <FileText className="h-3 w-3" />{comment.attachment_name}
            </div>
          )}
        </a> : null}
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button onClick={onToggleStatus}
          className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0",
            comment.status === "open" ? "border-status-warning/30 text-status-warning bg-status-warning/10" : "border-status-ok/30 text-status-ok bg-status-ok/10")}>
          {comment.status === "open" ? "未対応" : "対応済"}
        </button>
        {!isReply && (
          <button onClick={onReply} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0">
            <Reply className="h-3 w-3" />返信
          </button>
        )}
        {isOwn && !isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
            >
              <Pencil className="h-3 w-3" />編集
            </button>
            <button
              onClick={() => onDelete?.(comment.id)}
              className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 shrink-0"
            >
              <Trash2 className="h-3 w-3" />削除
            </button>
          </>
        ) : null}
        <div className="flex-1" />
        {!isReply && onReplicate ? (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="その他の操作"
              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-7 z-20 w-48 rounded-md border border-border bg-popover shadow-md p-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onReplicate();
                  }}
                  className="w-full text-left text-xs px-2.5 py-1.5 rounded flex items-center gap-2 hover:bg-muted"
                >
                  <Copy className="h-3.5 w-3.5" />他のファイルにも反映
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
