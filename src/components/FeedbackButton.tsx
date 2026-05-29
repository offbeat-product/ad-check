import { useState, useCallback, useEffect } from "react";
import { MessageCircle, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  buildErrorReportContextData,
  contextPayloadToJson,
} from "@/lib/feedback-page-context";

export type FeedbackProduct = "ad_check" | "ad_brain" | "ad_gen" | "other";

type ErrorCategory = "bug" | "feature_request" | "question" | "other";
type ErrorSeverity = "low" | "medium" | "high" | "critical";

type ChatStep = "category" | "severity" | "details";

const CATEGORY_CHOICES: { value: ErrorCategory; label: string }[] = [
  { value: "bug", label: "🐛 バグ" },
  { value: "feature_request", label: "💡 要望" },
  { value: "question", label: "❓ 質問" },
  { value: "other", label: "📝 その他" },
];

const SEVERITY_CHOICES: { value: ErrorSeverity; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "critical", label: "🚨 緊急" },
];

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </div>
  );
}

interface FeedbackButtonProps {
  product: FeedbackProduct;
  className?: string;
}

export function FeedbackButton({ product, className }: FeedbackButtonProps) {
  const location = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextPreview, setContextPreview] = useState<{
    page_name: string;
    pathname: string;
    project_name: string | null;
    product_name: string | null;
    file_name: string | null;
  } | null>(null);

  const [step, setStep] = useState<ChatStep>("category");
  const [category, setCategory] = useState<ErrorCategory | null>(null);
  const [severity, setSeverity] = useState<ErrorSeverity | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const resetFlow = useCallback(() => {
    setStep("category");
    setCategory(null);
    setSeverity(null);
    setTitle("");
    setDescription("");
    setSuccess(false);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    resetFlow();
    setContextPreview(null);
  }, [resetFlow]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContextLoading(true);
    void buildErrorReportContextData(location.pathname).then((data) => {
      if (cancelled) return;
      setContextPreview({
        page_name: data.page_name,
        pathname: data.pathname,
        project_name: data.project_name ?? null,
        product_name: data.product_name ?? null,
        file_name: data.file_name ?? null,
      });
      setContextLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      window.alert("フィードバックを送信するにはログインしてください。");
      return;
    }
    if (!category || !severity) return;
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      window.alert("タイトルと詳細を入力してください。");
      return;
    }

    setSubmitting(true);
    const contextData = await buildErrorReportContextData(location.pathname);
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
      context_data: contextPayloadToJson(contextData),
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
      handleClose();
    }, 2000);
  };

  const pickCategory = (c: ErrorCategory) => {
    setCategory(c);
    setStep("severity");
  };

  const pickSeverity = (s: ErrorSeverity) => {
    setSeverity(s);
    setStep("details");
  };

  if (location.pathname.startsWith("/creator/") || location.pathname.startsWith("/shared/")) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (open) {
            handleClose();
          } else {
            setOpen(true);
          }
        }}
        className={cn(
          "fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-opacity hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          className
        )}
        aria-label="サポート・フィードバック"
        aria-expanded={open}
      >
        <MessageCircle className="h-6 w-6" aria-hidden />
      </button>

      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 flex max-h-[600px] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl transition-all duration-300 ease-out",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        )}
        role="dialog"
        aria-label="Ad Check サポート"
        aria-hidden={!open}
      >
        <div className="flex shrink-0 items-center justify-between rounded-t-2xl bg-blue-600 px-4 py-3 text-white">
          <h2 className="text-sm font-semibold">🤖 Ad Check サポート</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-foreground">✅ 送信しました！</p>
            <p className="text-sm text-muted-foreground">ありがとうございます</p>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-border bg-gray-50 p-3 dark:bg-muted/40">
              <p className="mb-2 text-xs font-medium text-muted-foreground">📍 発生箇所</p>
              {contextLoading || !contextPreview ? (
                <p className="text-xs text-muted-foreground">読み込み中…</p>
              ) : (
                <ul className="space-y-1 text-xs text-foreground">
                  <li>
                    <span className="text-muted-foreground">ページ: </span>
                    {contextPreview.page_name}
                  </li>
                  {contextPreview.project_name ? (
                    <li>
                      <span className="text-muted-foreground">案件: </span>
                      {contextPreview.project_name}
                    </li>
                  ) : null}
                  {contextPreview.product_name ? (
                    <li>
                      <span className="text-muted-foreground">商材: </span>
                      {contextPreview.product_name}
                    </li>
                  ) : null}
                  {contextPreview.file_name ? (
                    <li>
                      <span className="text-muted-foreground">ファイル: </span>
                      {contextPreview.file_name}
                    </li>
                  ) : null}
                </ul>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <BotBubble>
                こんにちは！どのような問題ですか？カテゴリを選んでください👇
              </BotBubble>

              {step === "category" && (
                <div className="flex flex-wrap gap-2 pl-1">
                  {CATEGORY_CHOICES.map((c) => (
                    <Button
                      key={c.value}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => pickCategory(c.value)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              )}

              {category !== null && (
                <>
                  <BotBubble>緊急度を教えてください</BotBubble>
                  {step === "severity" && (
                    <div className="flex flex-wrap gap-2 pl-1">
                      {SEVERITY_CHOICES.map((s) => (
                        <Button
                          key={s.value}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => pickSeverity(s.value)}
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {severity !== null && (
                <>
                  <BotBubble>詳しく教えてください</BotBubble>
                  <form onSubmit={handleSubmit} className="space-y-3 pl-1 pt-1">
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="タイトル（1行）"
                      maxLength={500}
                      className="text-sm"
                    />
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      placeholder="状況や再現手順など"
                      className="resize-none text-sm"
                    />
                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      disabled={submitting}
                    >
                      {submitting ? "送信中…" : "送信"}
                    </Button>
                  </form>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
