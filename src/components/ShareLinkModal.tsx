import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ShareLinkRow } from "@/lib/db-types";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link2, Copy, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ShareLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkResultId: string;
}

export default function ShareLinkModal({ open, onOpenChange, checkResultId }: ShareLinkModalProps) {
  const { toast } = useToast();
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [useExpiry, setUseExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowCommentRead, setAllowCommentRead] = useState(true);
  const [allowCommentWrite, setAllowCommentWrite] = useState(true);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open) fetchLinks();
  }, [open, checkResultId]);

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from("share_links")
      .select("*")
      .eq("check_result_id", checkResultId)
      .order("created_at", { ascending: false });
    if (handleSupabaseError(error, "share_links")) return;
    setLinks(data ?? []);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const expiresAt = useExpiry ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null;

    try {
      const { data, error } = await supabase.functions.invoke("create-share-link", {
        body: {
          check_result_id: checkResultId,
          password: usePassword ? password : null,
          expires_at: expiresAt,
          allow_download: allowDownload,
          allow_comment_read: allowCommentRead,
          allow_comment_write: allowCommentWrite,
        },
      });
      if (error) throw error;
      if (data?.token) {
        const url = `${window.location.origin}/shared/${data.token}`;
        setGeneratedUrl(url);
        fetchLinks();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      toast({ title: "エラー", description: message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleCopy = () => {
    if (generatedUrl) {
      navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("share_links").delete().eq("id", id);
    if (!handleSupabaseError(error, "share_links delete")) fetchLinks();
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />共有リンク
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="create">
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">共有リンクを発行</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">発行履歴 ({links.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">パスワード付きリンク</span>
              <Switch checked={usePassword} onCheckedChange={setUsePassword} />
            </div>
            {usePassword && (
              <Input type="text" placeholder="半角英数字のみ使用可能" value={password}
                onChange={(e) => setPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))} />
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm">有効期限を指定する</span>
              <Switch checked={useExpiry} onCheckedChange={setUseExpiry} />
            </div>
            {useExpiry && (
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={100} value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} className="w-20" />
                <span className="text-sm text-muted-foreground">日間</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm">ダウンロードを許可する</span>
              <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">共有相手に付与する権限：</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowCommentRead} onChange={(e) => setAllowCommentRead(e.target.checked)} className="rounded" />
                コメントの閲覧可
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowCommentWrite} onChange={(e) => setAllowCommentWrite(e.target.checked)} className="rounded" />
                コメントの投稿可
              </label>
              <p className="text-xs text-muted-foreground">リンクを送られたユーザーがレビュー画面でコメント機能を使用できます</p>
            </div>

            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              <Link2 className="h-4 w-4 mr-2" />共有リンクを発行
            </Button>

            {generatedUrl && (
              <div className="flex gap-2">
                <Input value={generatedUrl} readOnly className="text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-status-ok" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">発行履歴がありません</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {links.map((link) => (
                  <div key={link.id} className="flex items-center gap-2 p-3 rounded-lg border border-border text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{window.location.origin}/shared/{link.token}</p>
                      <p className="text-xs text-muted-foreground">
                        {link.created_at ? new Date(link.created_at).toLocaleDateString("ja-JP") : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] shrink-0",
                      isExpired(link.expires_at) ? "text-status-ng" : "text-status-ok")}>
                      {isExpired(link.expires_at) ? "期限切れ" : "有効"}
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleDelete(link.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
