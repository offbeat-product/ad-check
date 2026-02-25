import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Comment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle, Pin, Reply } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommentsPanelProps {
  checkResultId: string;
  filterItemId?: string | null;
}

export default function CommentsPanel({ checkResultId, filterItemId }: CommentsPanelProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [tab, setTab] = useState<"all" | "open" | "resolved">("all");
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const fetchComments = async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("check_result_id", checkResultId)
      .order("created_at", { ascending: true });
    setComments((data as any as Comment[]) || []);
  };

  useEffect(() => {
    fetchComments();
  }, [checkResultId]);

  const filtered = comments.filter((c) => {
    if (filterItemId && c.check_item_id !== filterItemId) return false;
    if (tab === "open") return c.status === "open";
    if (tab === "resolved") return c.status === "resolved";
    return true;
  });

  const topLevel = filtered.filter((c) => !c.parent_id);
  const replies = (parentId: string) => filtered.filter((c) => c.parent_id === parentId);

  const countByTab = (t: "all" | "open" | "resolved") => {
    const base = comments.filter((c) => !filterItemId || c.check_item_id === filterItemId);
    if (t === "open") return base.filter((c) => c.status === "open").length;
    if (t === "resolved") return base.filter((c) => c.status === "resolved").length;
    return base.length;
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || !user) return;
    await supabase.from("comments").insert({
      check_result_id: checkResultId,
      check_item_id: filterItemId || null,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: newComment,
      status: "open",
    } as any);
    setNewComment("");
    fetchComments();
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim() || !user) return;
    const parent = comments.find((c) => c.id === parentId);
    await supabase.from("comments").insert({
      check_result_id: checkResultId,
      check_item_id: parent?.check_item_id || null,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: replyText,
      status: "open",
      parent_id: parentId,
    } as any);
    setReplyTo(null);
    setReplyText("");
    fetchComments();
  };

  const toggleStatus = async (id: string, current: string) => {
    const next = current === "open" ? "resolved" : "open";
    await supabase.from("comments").update({ status: next } as any).eq("id", id);
    fetchComments();
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

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">コメント</span>
        </div>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t.label}
              <span className="ml-1 opacity-70">({countByTab(t.key)})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {topLevel.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">コメントはまだありません</p>
        )}
        {topLevel.map((c) => (
          <div key={c.id} className="space-y-2">
            <CommentCard
              comment={c}
              onToggleStatus={() => toggleStatus(c.id, c.status)}
              onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
              timeAgo={timeAgo}
            />
            {/* Replies */}
            {replies(c.id).map((r) => (
              <div key={r.id} className="ml-6">
                <CommentCard
                  comment={r}
                  onToggleStatus={() => toggleStatus(r.id, r.status)}
                  onReply={() => {}}
                  timeAgo={timeAgo}
                  isReply
                />
              </div>
            ))}
            {/* Reply input */}
            {replyTo === c.id && (
              <div className="ml-6 flex gap-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="返信を入力..."
                  className="min-h-[60px] text-xs"
                />
                <Button size="sm" onClick={() => handleReply(c.id)} className="self-end">
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="コメントを入力..."
            className="min-h-[60px] text-sm"
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
          />
          <Button size="icon" onClick={handleSubmit} className="self-end shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentCard({
  comment, onToggleStatus, onReply, timeAgo, isReply,
}: {
  comment: Comment;
  onToggleStatus: () => void;
  onReply: () => void;
  timeAgo: (d: string) => string;
  isReply?: boolean;
}) {
  const initial = comment.author_name.charAt(0).toUpperCase();
  const colors = ["bg-primary", "bg-status-ok", "bg-context-client", "bg-product-cta"];
  const colorIdx = comment.author_name.charCodeAt(0) % colors.length;

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white", colors[colorIdx])}>
          {initial}
        </div>
        <span className="text-xs font-medium flex-1">{comment.author_name}</span>
        <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
      </div>
      <p className="text-sm">{comment.content}</p>
      {comment.annotation_data && (
        <div className="flex items-center gap-1 text-xs text-primary">
          <Pin className="h-3 w-3" />
          画像上の指摘
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleStatus}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full border font-medium",
            comment.status === "open"
              ? "border-status-warning/30 text-status-warning bg-status-warning/10"
              : "border-status-ok/30 text-status-ok bg-status-ok/10"
          )}
        >
          {comment.status === "open" ? "未対応" : "対応済"}
        </button>
        {!isReply && (
          <button onClick={onReply} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Reply className="h-3 w-3" />
            返信
          </button>
        )}
      </div>
    </div>
  );
}
