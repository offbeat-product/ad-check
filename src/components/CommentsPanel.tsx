import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Comment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, MessageCircle, Pin, Reply, Paperclip, X, FileText } from "lucide-react";
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
  const [attachment, setAttachment] = useState<{ file: File; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("check_result_id", checkResultId)
      .order("created_at", { ascending: true });
    setComments((data as any as Comment[]) || []);
  };

  useEffect(() => { fetchComments(); }, [checkResultId]);

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

  const uploadAttachment = async (file: File): Promise<{ url: string; type: string; name: string } | null> => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${checkResultId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("comment-attachments").upload(path, file);
    if (error) return null;
    const { data: urlData } = supabase.storage.from("comment-attachments").getPublicUrl(path);
    return { url: urlData.publicUrl, type: file.type, name: file.name };
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || !user) return;
    setUploading(true);

    let attachmentData: any = {};
    if (attachment) {
      const result = await uploadAttachment(attachment.file);
      if (result) {
        attachmentData = {
          attachment_url: result.url,
          attachment_type: result.type,
          attachment_name: result.name,
        };
      }
    }

    await supabase.from("comments").insert({
      check_result_id: checkResultId,
      check_item_id: filterItemId || null,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: newComment,
      status: "open",
      ...attachmentData,
    } as any);
    setNewComment("");
    setAttachment(null);
    setUploading(false);
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

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
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
              timeAgo={timeAgo}
            />
            {replies(c.id).map((r) => (
              <div key={r.id} className="ml-5">
                <CommentCard comment={r} onToggleStatus={() => toggleStatus(r.id, r.status)} onReply={() => {}} timeAgo={timeAgo} isReply />
              </div>
            ))}
            {replyTo === c.id && (
              <div className="ml-5 flex gap-2">
                <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="返信を入力..." className="min-h-[50px] text-xs" />
                <Button size="sm" onClick={() => handleReply(c.id)} className="self-end h-8">
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 shrink-0 space-y-2">
        {attachment && (
          <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
            {attachment.preview ? (
              <img src={attachment.preview} alt="" className="w-10 h-10 rounded object-cover" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground truncate flex-1">{attachment.file.name}</span>
            <button onClick={() => setAttachment(null)}><X className="h-3 w-3 text-muted-foreground" /></button>
          </div>
        )}
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
  const ext = comment as any;

  return (
    <div className="border border-border rounded-lg p-2.5 space-y-1.5 bg-card">
      <div className="flex items-center gap-2">
        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white", colors[colorIdx])}>
          {initial}
        </div>
        <span className="text-xs font-medium flex-1">{comment.author_name}</span>
        <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
      </div>
      <p className="text-xs">{comment.content}</p>
      {comment.annotation_data && (
        <div className="flex items-center gap-1 text-[10px] text-primary">
          <Pin className="h-3 w-3" />
          画像上の指摘
        </div>
      )}
      {ext.attachment_url && (
        <a href={ext.attachment_url} target="_blank" rel="noopener noreferrer" className="block">
          {ext.attachment_type?.startsWith("image/") ? (
            <img src={ext.attachment_url} alt={ext.attachment_name} className="max-h-20 rounded border border-border" />
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-primary hover:underline">
              <FileText className="h-3 w-3" />
              {ext.attachment_name}
            </div>
          )}
        </a>
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
