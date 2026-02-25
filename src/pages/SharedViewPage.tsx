import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { CheckRecord, CheckItem } from "@/lib/types";
import { getCheckMarkers } from "@/lib/marker-positions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ImagePreview from "@/components/review/ImagePreview";
import ScriptDisplay from "@/components/review/ScriptDisplay";
import ReviewRightPanel from "@/components/review/ReviewRightPanel";
import { useReviewState } from "@/hooks/useReviewState";
import { Lock, AlertTriangle } from "lucide-react";

const statusOrder: Record<string, number> = { NG: 0, WARNING: 1, OK: 2 };

export default function SharedViewPage() {
  const { token } = useParams<{ token: string }>();
  const [shareLink, setShareLink] = useState<any>(null);
  const [record, setRecord] = useState<CheckRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const checkItems = record ? (record.check_items as any[]) : null;
  const { items, markers, commentCounts, paintMode, setPaintMode, highlightCard, rightTab, setRightTab, commentFilter, scrollToCard, handleCommentClick } =
    useReviewState(record?.id, checkItems);

  useEffect(() => {
    if (!token) return;
    loadShareLink();
  }, [token]);

  const loadShareLink = async () => {
    // Use anon key to fetch share link (no auth required)
    const { data, error: fetchError } = await supabase
      .from("share_links")
      .select("*")
      .eq("token", token!)
      .single();

    if (fetchError || !data) {
      setError("共有リンクが見つかりません");
      setLoading(false);
      return;
    }

    const link = data as any;

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      setError("この共有リンクは期限切れです");
      setLoading(false);
      return;
    }

    setShareLink(link);

    // Check if password is required
    if (link.password_hash) {
      setPasswordRequired(true);
      setLoading(false);
      return;
    }

    await loadCheckResult(link.check_result_id);
  };

  const loadCheckResult = async (checkResultId: string) => {
    const { data: cr } = await supabase.from("check_results").select("*").eq("id", checkResultId).single();
    if (cr) {
      setRecord(cr as any);
    } else {
      setError("チェック結果が見つかりません");
    }
    setLoading(false);
  };

  const handlePasswordSubmit = async () => {
    if (!shareLink) return;
    // Verify password via edge function
    try {
      const res = await supabase.functions.invoke("verify-share-password", {
        body: { share_link_id: shareLink.id, password: passwordInput },
      });
      if (res.data?.valid) {
        setPasswordRequired(false);
        setLoading(true);
        await loadCheckResult(shareLink.check_result_id);
      } else {
        setPasswordError(true);
      }
    } catch {
      // Fallback: plain text comparison for links created before hashing
      if (shareLink.password_hash === passwordInput) {
        setPasswordRequired(false);
        setLoading(true);
        await loadCheckResult(shareLink.check_result_id);
      } else {
        setPasswordError(true);
      }
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">読み込み中...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-muted-foreground gap-3">
        <AlertTriangle className="h-10 w-10 text-status-warning" />
        <p className="text-lg font-medium">{error}</p>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-[360px] space-y-4 p-6 border border-border rounded-xl bg-card shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-primary" />
            パスワードが必要です
          </div>
          <Input
            type="password"
            placeholder="パスワードを入力"
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
          />
          {passwordError && <p className="text-xs text-destructive">パスワードが正しくありません</p>}
          <Button className="w-full" onClick={handlePasswordSubmit}>確認</Button>
        </div>
      </div>
    );
  }

  if (!record) return null;

  const isSf = record.process_type === "sf";
  const inputData = record.input_data as { image_base64?: string; script_text?: string } | null;
  const canComment = shareLink?.allow_comment_write;
  const canReadComments = shareLink?.allow_comment_read;

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card shrink-0">
          <span className="text-sm font-bold">♟ CheckMate AI</span>
          <Badge variant="outline" className="text-xs">共有ビュー</Badge>
          <span className="text-sm text-muted-foreground ml-2">{record.client_name} / {record.product_name}</span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {isSf ? (
              <ImagePreview
                imageSrc={inputData?.image_base64}
                markers={markers}
                paintMode={false}
                onPaintModeToggle={() => {}}
                onMarkerClick={scrollToCard}
                label={`${record.client_name} / ${record.product_name} / スタイルフレーム`}
                noDataMessage="プレビュー不可"
              />
            ) : (
              <div>
                <span className="text-xs text-muted-foreground mb-2 block">{record.client_name} / {record.product_name} / 字コンテ</span>
                <ScriptDisplay text={inputData?.script_text || record.input_text || ""} items={items} markers={markers} onItemClick={scrollToCard} />
              </div>
            )}
          </div>
        </div>
      </div>

      {canReadComments && (
        <ReviewRightPanel
          rightTab={rightTab}
          onTabChange={setRightTab}
          items={items}
          markers={markers}
          productCode={record.product_code}
          commentCounts={commentCounts}
          highlightCard={highlightCard}
          commentFilter={commentFilter}
          checkResultId={record.id}
          hasCheckResult={true}
          onCommentClick={handleCommentClick}
        />
      )}
    </div>
  );
}
