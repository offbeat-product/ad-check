import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { CheckItem } from "@/lib/types";
import type { CheckResultRow, ShareLinkRow } from "@/lib/db-types";
import { getCheckMarkers } from "@/lib/marker-positions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ImagePreview from "@/components/review/ImagePreview";
import ScriptDisplay from "@/components/review/ScriptDisplay";
import ReviewRightPanel from "@/components/review/ReviewRightPanel";
import { useReviewState } from "@/hooks/useReviewState";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Lock, AlertTriangle, Rocket } from "lucide-react";

export default function SharedViewPage() {
  const { token } = useParams<{ token: string }>();
  const [shareLink, setShareLink] = useState<ShareLinkRow | null>(null);
  const [record, setRecord] = useState<CheckResultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const checkItems = record?.check_items ? (record.check_items as unknown as CheckItem[]) : null;
  const { items, markers, commentCounts, highlightCard, rightTab, setRightTab, commentFilter, scrollToCard, handleCommentClick } =
    useReviewState(record?.id, checkItems);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadShareLink(cancelled);
    return () => { cancelled = true; };
  }, [token]);

  const loadShareLink = async (cancelled = false) => {
    const { data: rows, error: fetchError } = await supabase
      .rpc("get_share_link_by_token", { token_param: token! });
    const data = rows && rows.length > 0 ? rows[0] : null;

    if (cancelled) return;

    if (fetchError || !data) {
      setError("共有リンクが見つかりません");
      setLoading(false);
      return;
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      setError("この共有リンクは期限切れです");
      setLoading(false);
      return;
    }

    setShareLink(data);

    if (data.password_hash) {
      setPasswordRequired(true);
      setLoading(false);
      return;
    }

    if (data.check_result_id) await loadCheckResult(data.check_result_id, cancelled);
    else { setError("チェック結果が見つかりません"); setLoading(false); }
  };

  const loadCheckResult = async (checkResultId: string, cancelled = false) => {
    const { data: rows, error } = await supabase
      .rpc("get_shared_check_result", { p_check_result_id: checkResultId, p_share_token: token! });
    if (cancelled) return;
    const cr = rows && rows.length > 0 ? rows[0] : null;
    if (error || !cr) {
      setError("チェック結果が見つかりません");
    } else {
      setRecord(cr as CheckResultRow);
    }
    setLoading(false);
  };

  const handlePasswordSubmit = async () => {
    if (!shareLink) return;
    try {
      const res = await supabase.functions.invoke("verify-share-password", {
        body: { share_link_id: shareLink.id, password: passwordInput },
      });
      if (res.data?.valid) {
        setPasswordRequired(false);
        setLoading(true);
        if (shareLink.check_result_id) await loadCheckResult(shareLink.check_result_id);
      } else {
        setPasswordError(true);
      }
    } catch {
      setPasswordError(true);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">読み込み中...</div>;

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
            <Lock className="h-4 w-4 text-primary" />パスワードが必要です
          </div>
          <Input type="password" placeholder="パスワードを入力" value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()} />
          {passwordError && <p className="text-xs text-destructive">パスワードが正しくありません</p>}
          <Button className="w-full" onClick={handlePasswordSubmit}>確認</Button>
        </div>
      </div>
    );
  }

  if (!record) return null;

  const isSf = record.process_type === "sf" || record.process_type === "styleframe" || record.process_type === "storyboard";
  const inputData = record.input_data as { image_base64?: string; script_text?: string } | null;
  const canReadComments = shareLink?.allow_comment_read;

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card shrink-0">
          <span className="text-sm font-bold flex items-center gap-1"><Rocket className="h-4 w-4" /> CheckGo AI</span>
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
