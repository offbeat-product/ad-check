import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = { admin: "管理者", member: "メンバー", viewer: "閲覧者" };

interface InvitationInfo {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  status: string;
  expires_at: string;
  inviter_name: string | null;
}

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("招待トークンが見つかりません。");
      setLoading(false);
      return;
    }

    (async () => {
      const { data, error: err } = await supabase.rpc("get_invitation_by_token", { p_token: token });
      if (err || !data || (data as any[]).length === 0) {
        setError("この招待リンクは無効です。管理者に再招待を依頼してください。");
        setLoading(false);
        return;
      }

      const inv = (data as any[])[0] as InvitationInfo;

      if (inv.status !== "pending") {
        setError(inv.status === "accepted" ? "この招待は既に承認されています。ログインしてください。" : "この招待リンクは無効または期限切れです。");
        setLoading(false);
        return;
      }

      if (new Date(inv.expires_at) < new Date()) {
        setError("この招待リンクは期限切れです。管理者に再招待を依頼してください。");
        setLoading(false);
        return;
      }

      setInvitation(inv);
      setDisplayName(inv.display_name || "");
      setLoading(false);
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation || !token) return;

    if (password !== confirmPassword) {
      toast({ title: "エラー", description: "パスワードが一致しません。", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "エラー", description: "パスワードは6文字以上で設定してください。", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: { display_name: displayName || undefined },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (authError) throw authError;

      // Accept the invitation (updates profile role)
      if (authData.user) {
        await supabase.rpc("accept_invitation", { p_token: token, p_user_id: authData.user.id });

        // Update display_name if provided
        if (displayName) {
          await supabase.from("profiles").update({ display_name: displayName }).eq("id", authData.user.id);
        }
      }

      toast({ title: "アカウントを作成しました", description: "ダッシュボードにリダイレクトします。" });
      navigate("/dashboard");
    } catch (err: any) {
      // If user already exists, try sign in
      if (err.message?.includes("already registered") || err.message?.includes("already been registered")) {
        toast({
          title: "このメールアドレスは既に登録されています",
          description: "ログインページからログインしてください。",
        });
        navigate("/login");
      } else {
        toast({ title: "エラー", description: err.message, variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-1 flex-wrap">
            <span className="text-4xl" style={{ color: "#0EA5E9" }}>∞</span>
            <span className="text-4xl font-bold" style={{ color: "#0EA5E9" }}>Ad Check</span>
          </h1>
          <div className="glass-card p-8 space-y-4">
            <p className="text-destructive font-medium">{error}</p>
            <Button variant="outline" onClick={() => navigate("/login")}>
              ログインページへ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-1 flex-wrap">
            <span className="text-4xl" style={{ color: "#0EA5E9" }}>∞</span>
            <span className="text-4xl font-bold" style={{ color: "#0EA5E9" }}>Ad Check</span>
          </h1>
          <p className="text-sm text-muted-foreground whitespace-nowrap">広告制作現場に最良・最速の「GO」を。</p>
        </div>

        <div className="glass-card p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold">Ad Checkへようこそ</h2>
            <p className="text-sm text-muted-foreground">
              {invitation?.inviter_name}さんから招待されました
            </p>
            <Badge variant="secondary" className="mt-2">
              {ROLE_LABELS[invitation?.role || "viewer"]}として参加
            </Badge>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>メールアドレス</Label>
              <Input value={invitation?.email || ""} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">表示名</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例: 山田太郎"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6文字以上"
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">パスワード（確認）</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="もう一度入力"
                required
                minLength={6}
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full bg-primary text-primary-foreground font-semibold">
              {submitting ? "作成中..." : "アカウントを作成"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            既にアカウントをお持ちですか？{" "}
            <button type="button" onClick={() => navigate("/login")} className="text-primary hover:underline">
              ログイン
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
