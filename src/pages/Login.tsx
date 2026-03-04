import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Rocket } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (resetMode) {
        await resetPassword(email);
        toast({ title: "パスワードリセットメールを送信しました", description: "メールを確認してパスワードを再設定してください。" });
        setResetMode(false);
      } else {
        await signIn(email, password);
        
        // Check if user is active (with timeout to prevent hang on DB issues)
        try {
          const profileCheck = supabase.auth.getUser().then(async ({ data: { user: u } }) => {
            if (!u) return null;
            const { data: profile } = await supabase
              .from("profiles")
              .select("is_active")
              .eq("id", u.id)
              .single();
            return profile;
          });
          
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
          const profile = await Promise.race([profileCheck, timeoutPromise]);
          
          if (profile && profile.is_active === false) {
            await supabase.auth.signOut();
            toast({ title: "エラー", description: "このアカウントは無効化されています。管理者にお問い合わせください。", variant: "destructive" });
            return;
          }
        } catch (e) {
          console.warn("[Login] Profile active check skipped due to error:", e);
        }
        
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">
            <Rocket className="h-8 w-8 mr-2 inline-block" fill="currentColor" />
            <span className="gradient-text">CheckGo AI</span>
          </h1>
          <p className="text-sm text-muted-foreground whitespace-nowrap">制作現場に、最速・最高品質の「GO」を。</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6">
          <h2 className="text-xl font-semibold">
            {resetMode ? "パスワードリセット" : "ログイン"}
          </h2>

          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          {!resetMode && (
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
            {loading ? "処理中..." : resetMode ? "リセットメールを送信" : "ログイン"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {resetMode ? (
              <button type="button" onClick={() => setResetMode(false)} className="text-primary hover:underline">
                ログインに戻る
              </button>
            ) : (
              <button type="button" onClick={() => setResetMode(true)} className="text-primary hover:underline">
                パスワードを忘れた方はこちら
              </button>
            )}
          </p>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          招待制のため、管理者からの招待が必要です
        </p>
      </div>
    </div>
  );
}
