import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CommentRow, CommentWithDraftInfo } from "@/lib/db-types";
import { matchesCommentItemFilter, withDefaultDraftInfo } from "@/lib/comment-draft-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Send, User, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import TimestampBadge from "@/components/comments/TimestampBadge";

interface SharedCommentsPanelProps {
  checkResultId: string;
  shareToken: string;
  allowWrite: boolean;
  filterItemId?: string | null;
  onAnnotationClick?: (data: unknown) => void;
  mediaCurrentTime?: number | null;
  onSeekMedia?: (seconds: number) => void;
  refreshKey?: number;
}

type SharedCommentsWithDraftRpc = (
  fn: "get_shared_comments_with_draft_info",
  args: { p_check_result_id: string; p_share_token: string },
) => Promise<{ data: CommentWithDraftInfo[] | null; error: { message: string } | null }>;

type SharedCommentsRpc = (
  fn: "get_shared_comments",
  args: { p_check_result_id: string; p_share_token: string },
) => Promise<{ data: CommentRow[] | null; error: { message: string } | null }>;

export default function SharedCommentsPanel({
  checkResultId, shareToken, allowWrite, filterItemId,
  onAnnotationClick, mediaCurrentTime, onSeekMedia, refreshKey,
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

  const fetchComments = async () => {
    let result: CommentWithDraftInfo[] = [];

    try {
      const draftRpc = supabase.rpc as unknown as SharedCommentsWithDraftRpc;
      const { data: draftData, error: draftError } = await draftRpc("get_shared_comments_with_draft_info", {
        p_check_result_id: checkResultId,
        p_share_token: shareToken,
      });
      if (!draftError && draftData && draftData.length > 0) {
        result = draftData;
      } else {
        if (draftError) {
          console.warn("[get_shared_comments_with_draft_info] using legacy RPC fallback:", draftError.message);
        }
        const legacyRpc = supabase.rpc as unknown as SharedCommentsRpc;
        const { data, error } = await legacyRpc("get_shared_comments", {
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

    setComments(result.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)));
  };

  useEffect(() => { fetchComments(); }, [checkResultId, refreshKey]);

  // Poll for new comments every 15s
  useEffect(() => {
    const interval = setInterval(fetchComments, 15000);
    return () => clearInterval(interval);
  }, [checkResultId, shareToken]);

  const filtered = comments.filter((c) => {
    if (!matchesCommentItemFilter(c, filterItemId)) return false;
    if (tab === "open") return c.status === "open";
    if (tab === "resolved") return c.status === "resolved";
    return true;
  });

  const topLevel = filtered.filter((c) => !c.parent_id);
  const getReplies = (parentId: string) => filtered.filter((c) => c.parent_id === parentId);

  const countByTab = (t: "all" | "open" | "resolved") => {
    const base = comments.filter((c) => matchesCommentItemFilter(c, filterItemId));
    if (t === "open") return base.filter((c) => c.status === "open").length;
    if (t === "resolved") return base.filter((c) => c.status === "resolved").length;
    return base.length;
  };

  const handleSaveGuest = () => {
    if (!guestName.trim()) return;
    localStorage.setItem("shared_guest_name", guestName.trim());
    if (guestEmail.trim()) localStorage.setItem("shared_guest_email", guestEmail.trim());
    setShowGuestForm(false);
  };

  const postComment = async (content: string, parentId?: string) => {
    setPosting(true);
    try {
      const res = await supabase.functions.invoke("shared-comments", {
        body: {
          share_token: shareToken,
          check_result_id: checkResultId,
          author_name: guestName.trim(),
          author_email: guestEmail.trim() || "shared@guest",
          content,
          check_item_id: filterItemId || null,
          media_timestamp: (!parentId && mediaCurrentTime != null && mediaCurrentTime > 0) ? mediaCurrentTime : null,
          parent_id: parentId || null,
        },
      });
      if (res.error) console.error("[shared-comments]", res.error);
      await fetchComments();
    } catch (err) {
      console.error("[shared-comments] error:", err);
    }
    setPosting(false);
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    await postComment(newComment.trim());
    setNewComment("");
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    await postComment(replyText.trim(), parentId);
    setReplyTo(null);
    setReplyText("");
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
              timeAgo={timeAgo}
              onAnnotationClick={onAnnotationClick}
              onSeekMedia={onSeekMedia}
              onReply={allowWrite ? () => setReplyTo(replyTo === c.id ? null : c.id) : undefined}
            />
            {getReplies(c.id).map((r) => (
              <div key={r.id} className="ml-5">
                <SharedCommentCard comment={r} timeAgo={timeAgo} onSeekMedia={onSeekMedia} isReply />
              </div>
            ))}
            {replyTo === c.id && (
              <div className="ml-5 flex gap-2">
                <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="返信を入力..." className="min-h-[50px] text-xs" />
                <Button size="sm" onClick={() => handleReply(c.id)} disabled={posting} className="self-end h-8">
                  <Send className="h-3 w-3" />
                </Button>
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
              <div className="flex gap-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="コメントを入力..."
                  className="min-h-[50px] text-xs flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
                />
                <Button size="icon" onClick={handleSubmit} disabled={posting || !newComment.trim()} className="self-end shrink-0 h-8 w-8">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div> : null}
    </div>
  );
}

function SharedCommentCard({ comment, timeAgo, onAnnotationClick, onSeekMedia, onReply, isReply }: {
  comment: CommentWithDraftInfo;
  timeAgo: (d: string) => string;
  onAnnotationClick?: (data: unknown) => void;
  onSeekMedia?: (seconds: number) => void;
  onReply?: () => void;
  isReply?: boolean;
}) {
  const hasAnnotation = !!comment.annotation_data;
  const showDraftBadge = !comment.is_current_draft && !!comment.draft_label;
  const isInitialDraft = comment.draft_round === 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border p-3 space-y-1.5",
        isReply && "bg-muted/30",
        !comment.is_current_draft && "opacity-75"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{comment.author_name}</span>
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
          {comment.media_timestamp != null && (
            <TimestampBadge seconds={comment.media_timestamp} onClick={() => onSeekMedia?.(comment.media_timestamp!)} />
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
      </div>
      <p className="text-xs whitespace-pre-wrap">{comment.content}</p>
      {hasAnnotation ? <button onClick={() => onAnnotationClick?.(comment.annotation_data)} className="text-[10px] text-primary hover:underline">
          📌 アノテーションを表示
        </button> : null}
      <div className="flex items-center gap-2">
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full",
          comment.status === "open" ? "bg-status-warning/10 text-status-warning" : "bg-status-ok/10 text-status-ok")}>
          {comment.status === "open" ? "未対応" : "対応済"}
        </span>
        {onReply ? <button onClick={onReply} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            <Reply className="h-3 w-3" />返信
          </button> : null}
      </div>
    </div>
  );
}
