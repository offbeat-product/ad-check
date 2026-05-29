import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Check, Clock3, Copy, FileText, MessageCircleReply, Pencil, SmilePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { humanSize, isImage, type CommentAttachmentView } from "@/lib/comment-attachments";
import { COMMENT_REACTION_CHOICES } from "@/lib/comment-reactions";
import { parseTimestampFromText, isValidMediaTimestamp } from "@/lib/comment-annotations";
import { cn } from "@/lib/utils";

export type CommentRole = "internal" | "creator" | "client";

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface RichCommentCardProps {
  authorName: string;
  role: CommentRole;
  createdAt: string;
  status?: "open" | "resolved" | string | null;
  onToggleStatus?: () => void;
  content: string;
  commentNumber?: number | null;
  mediaTimestamp?: number | null;
  onSeekMedia?: (seconds: number) => void;
  attachments?: CommentAttachmentView[];
  reactions?: ReactionSummary[];
  onToggleReaction?: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopyToOtherFiles?: () => void;
  isEditing?: boolean;
  editingText?: string;
  setEditingText?: (value: string) => void;
  onSubmitEdit?: () => void;
  onCancelEdit?: () => void;
  isReply?: boolean;
  replyingToName?: string | null;
  isSelected?: boolean;
  isDimmed?: boolean;
  onCardClick?: () => void;
  headerSlot?: ReactNode;
  metaSlot?: ReactNode;
  contentSlot?: ReactNode;
  actionSlot?: ReactNode;
  children?: ReactNode;
}

const ROLE_STYLE: Record<CommentRole, { label: string; className: string; avatarClassName: string }> = {
  internal: {
    label: "社内",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    avatarClassName: "bg-blue-100 text-blue-800",
  },
  creator: {
    label: "クリエイター",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    avatarClassName: "bg-emerald-100 text-emerald-800",
  },
  client: {
    label: "クライアント",
    className: "bg-orange-50 text-orange-700 border-orange-200",
    avatarClassName: "bg-orange-100 text-orange-800",
  },
};

function getInitial(authorName: string) {
  const trimmed = authorName.trim();
  return (trimmed || "?").slice(0, 1).toUpperCase();
}

function getRelativeTime(iso: string) {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "";
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return `${Math.floor(days / 7)}週間前`;
}

function getFullTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

const COMMENT_CONTENT_TOKEN_RE = /(@[^\s@]+)|(\[\d+:\d{2}\.\d{3}\])/g;

function renderCommentContent(
  content: string,
  mediaTimestamp: number | null | undefined,
  onSeekMedia?: (seconds: number) => void
) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(COMMENT_CONTENT_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex, index)}</span>);
    }

    const [fullMatch, mention, timestampText] = match;
    if (mention) {
      parts.push(
        <span key={`mention-${index}`} className="font-semibold text-primary">
          {mention}
        </span>
      );
    } else if (timestampText && onSeekMedia) {
      const seconds =
        parseTimestampFromText(timestampText) ??
        (isValidMediaTimestamp(mediaTimestamp) ? mediaTimestamp : null);
      parts.push(
        <button
          key={`timestamp-${index}`}
          type="button"
          onClick={stopPropagation(() => {
            if (seconds != null) onSeekMedia(seconds);
          })}
          className="font-medium text-primary hover:underline"
          title="この時間にジャンプ"
        >
          {timestampText}
        </button>
      );
    } else {
      parts.push(<span key={`plain-${index}`}>{fullMatch}</span>);
    }

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : content;
}

function stopPropagation(handler?: () => void) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handler?.();
  };
}

export function RichCommentCard({
  authorName,
  role,
  createdAt,
  status,
  onToggleStatus,
  content,
  commentNumber,
  mediaTimestamp,
  onSeekMedia,
  attachments = [],
  reactions = [],
  onToggleReaction,
  onReply,
  onEdit,
  onDelete,
  onCopyToOtherFiles,
  isEditing,
  editingText,
  setEditingText,
  onSubmitEdit,
  onCancelEdit,
  isReply,
  replyingToName,
  isSelected,
  isDimmed,
  onCardClick,
  headerSlot,
  metaSlot,
  contentSlot,
  actionSlot,
  children,
}: RichCommentCardProps) {
  const roleStyle = ROLE_STYLE[role];
  const visibleReactions = reactions.filter((reaction) => reaction.count > 0 || reaction.reactedByMe);
  const isClickable = Boolean(onCardClick);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const reactionPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reactionPickerOpen) return;

    const onDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (reactionPickerOpen && reactionPickerRef.current && !reactionPickerRef.current.contains(target)) {
        setReactionPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [reactionPickerOpen]);

  return (
    <div
      className={cn(
        "rounded-lg transition-colors",
        "p-0",
        isSelected && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
        isClickable && "cursor-pointer hover:border-primary/40 hover:bg-primary/5",
        isDimmed && "opacity-75"
      )}
      onClick={onCardClick}
    >
      <div className="flex items-start gap-2.5">
        {!isReply && commentNumber != null ? (
          <span
            className="inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary"
            title={`コメント番号 ${commentNumber}`}
          >
            {commentNumber}
          </span>
        ) : null}
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full font-bold",
            isReply ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs",
            roleStyle.avatarClassName
          )}
        >
          {getInitial(authorName)}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{authorName || "匿名ユーザー"}</span>
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", roleStyle.className)}>
                  {roleStyle.label}
                </span>
                {onCopyToOtherFiles ? (
                  <button
                    type="button"
                    onClick={stopPropagation(onCopyToOtherFiles)}
                    title="他のファイルにもコピー"
                    className="inline-flex items-center gap-0.5 rounded border border-border/50 px-1.5 py-px text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                    コピー
                  </button>
                ) : null}
                {headerSlot}
              </div>
              <span className="text-[11px] text-muted-foreground" title={getFullTime(createdAt)}>
                {getRelativeTime(createdAt)}
              </span>
            </div>
            {status ? (
              <button
                type="button"
                onClick={stopPropagation(onToggleStatus)}
                disabled={!onToggleStatus}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  onToggleStatus && "hover:opacity-80",
                  status === "resolved"
                    ? "bg-status-ok/10 text-status-ok"
                    : "bg-status-warning/10 text-status-warning"
                )}
              >
                {status === "resolved" ? "対応済" : "未対応"}
              </button>
            ) : null}
          </div>

          {metaSlot ? <div className="space-y-1">{metaSlot}</div> : null}

          {isReply && replyingToName ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageCircleReply className="h-3 w-3" />
              {replyingToName}さんへの返信
            </div>
          ) : null}

          {mediaTimestamp != null ? (
            <button
              type="button"
              onClick={stopPropagation(() => onSeekMedia?.(mediaTimestamp))}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              title="クリックで動画の該当位置へ移動"
            >
              <Clock3 className="h-3 w-3" />
              {formatTimestamp(mediaTimestamp)}
            </button>
          ) : null}

          {isEditing ? (
            <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
              <Textarea
                value={editingText ?? ""}
                onChange={(event) => setEditingText?.(event.target.value)}
                className="min-h-[56px] text-xs"
                autoFocus
              />
              <div className="flex gap-1.5">
                <Button size="sm" onClick={onSubmitEdit} disabled={!editingText?.trim()} className="h-7 px-2 text-[10px]">
                  <Check className="mr-1 h-3 w-3" />
                  保存
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelEdit} className="h-7 px-2 text-[10px]">
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {renderCommentContent(content, mediaTimestamp, onSeekMedia)}
            </p>
          )}

          {contentSlot}

          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
              {attachments.map((attachment) => (
                <a
                  key={attachment.id ?? `${attachment.file_name}-${attachment.signed_url}`}
                  href={attachment.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={attachment.file_name}
                  className={cn(
                    "group overflow-hidden rounded-md border border-border/70 bg-muted/30 hover:border-primary/40 hover:bg-primary/5",
                    isImage(attachment.mime_type) ? "block w-24" : "inline-flex max-w-full items-center gap-2 px-2 py-1.5"
                  )}
                  title={attachment.file_name}
                >
                  {isImage(attachment.mime_type) ? (
                    <>
                      <img
                        src={attachment.signed_url}
                        alt={attachment.file_name}
                        className="h-20 w-24 object-cover"
                        loading="lazy"
                      />
                      <span className="block truncate px-1.5 py-1 text-[10px] text-muted-foreground group-hover:text-foreground">
                        {attachment.file_name}
                      </span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs text-foreground">{attachment.file_name}</span>
                      {humanSize(attachment.size_bytes) ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">{humanSize(attachment.size_bytes)}</span>
                      ) : null}
                    </>
                  )}
                </a>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
            {visibleReactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onToggleReaction?.(reaction.emoji)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  reaction.reactedByMe
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-muted"
                )}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}

            {onReply ? (
              <button
                type="button"
                onClick={onReply}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <MessageCircleReply className="h-3 w-3" />
                返信
              </button>
            ) : null}
            {onEdit && !isEditing ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                編集
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                削除
              </button>
            ) : null}
            {onToggleReaction ? (
              <div className="relative ml-auto" ref={reactionPickerRef}>
                <button
                  type="button"
                  onClick={() => setReactionPickerOpen((open) => !open)}
                  aria-expanded={reactionPickerOpen}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <SmilePlus className="h-3 w-3" />
                  リアクション
                </button>
                {reactionPickerOpen ? (
                  <div className="absolute bottom-full right-0 z-20 mb-1 flex gap-1 rounded-lg border border-border/70 bg-popover p-1 shadow-md">
                    {COMMENT_REACTION_CHOICES.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          onToggleReaction(emoji);
                          setReactionPickerOpen(false);
                        }}
                        className="rounded px-1.5 py-1 text-base transition-colors hover:bg-muted"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {actionSlot}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
