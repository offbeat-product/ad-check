import { useState, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TablesInsert } from "@/integrations/supabase/types";

export type FeedbackProduct = "ad_check" | "ad_brain" | "ad_gen" | "other";

type ErrorCategory = "bug" | "feature_request" | "question" | "other";
type ErrorSeverity = "low" | "medium" | "high" | "critical";

const CATEGORY_OPTIONS: { value: ErrorCategory; label: string }[] = [
  { value: "bug", label: "不具合" },
  { value: "feature_request", label: "機能改善の提案" },
  { value: "question", label: "質問" },
  { value: "other", label: "その他" },
];

const SEVERITY_OPTIONS: { value: ErrorSeverity; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "critical", label: "緊急" },
];

interface FeedbackButtonProps {
  product: FeedbackProduct;
  className?: string;
}

export function FeedbackButton({ product, className }: FeedbackButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ErrorCategory>("bug");
  const [severity, setSeverity] = useState<ErrorSeverity>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const resetForm = useCallback(() => {
    setCategory("bug");
    setSeverity("medium");
    setTitle("");
    setDescription("");
    setSuccess(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        resetForm();
      }
    },
    [resetForm]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      window.alert("フィードバックを送信するにはログインしてください。");
      return;
    }
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      window.alert("タイトルと詳細を入力してください。");
      return;
    }

    setSubmitting(true);
    const row: TablesInsert<"error_reports"> = {
      product,
      category,
      severity,
      title: t,
      description: d,
      page_url: typeof window !== "undefined" ? window.location.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      reporter_id: user.id,
      reporter_email: user.email ?? null,
      status: "open",
    };

    const { error } = await supabase.from("error_reports").insert(row);

    setSubmitting(false);
    if (error) {
      window.alert(`送信に失敗しました: ${error.message}`);
      return;
    }

    setSuccess(true);
    window.setTimeout(() => {
      handleOpenChange(false);
    }, 1500);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          className
        )}
        aria-label="フィードバックを送る"
      >
        <MessageCircle className="h-6 w-6" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>フィードバック・不具合の報告</DialogTitle>
          </DialogHeader>

          {success ? (
            <p className="py-8 text-center text-sm font-medium">✅ 送信しました</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="feedback-category">カテゴリ</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as ErrorCategory)}
                >
                  <SelectTrigger id="feedback-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-severity">緊急度</Label>
                <Select
                  value={severity}
                  onValueChange={(v) => setSeverity(v as ErrorSeverity)}
                >
                  <SelectTrigger id="feedback-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-title">タイトル</Label>
                <Input
                  id="feedback-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="簡潔に"
                  maxLength={500}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-description">詳細</Label>
                <Textarea
                  id="feedback-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="再現手順や期待する動作など"
                  required
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  キャンセル
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "送信中…" : "送信"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
