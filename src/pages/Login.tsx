import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        toast({ title: "確認メールを送信しました", description: "メールを確認してアカウントを有効化してください。" });
      } else {
        await signIn(email, password);
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
            <span className="mr-2">♟</span>
            <span className="gradient-text">CheckMate AI</span>
          </h1>
          <p className="text-sm text-muted-foreground">終わらないリテイクに、終止符を。</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6">
          <h2 className="text-xl font-semibold">
            {isSignUp ? "アカウント作成" : "ログイン"}
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

          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
            {loading ? "処理中..." : isSignUp ? "アカウント作成" : "ログイン"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "既にアカウントをお持ちですか？" : "アカウントをお持ちでないですか？"}
            <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="ml-1 text-primary hover:underline">
              {isSignUp ? "ログイン" : "新規登録"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
