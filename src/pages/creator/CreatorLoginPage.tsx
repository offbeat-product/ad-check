import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CircleCheckBig } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/creator/account";
  return value;
}

export default function CreatorLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrorMessage("メールアドレスとパスワードを入力してください");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const redirectTo = safeRedirectPath(searchParams.get("redirect_to") ?? searchParams.get("redirect"));
      navigate(redirectTo, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-1.5 select-none" aria-hidden>
          <CircleCheckBig size={22} className="shrink-0 text-primary" strokeWidth={2.25} />
          <span className="bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent tracking-tight text-base font-bold">
            Ad Check
          </span>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Ad Check ログイン</h1>
          <p className="text-sm text-muted-foreground">クリエイター用アカウントでログインしてください。</p>
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">メールアドレス</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">パスワード</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <Button type="button" className="w-full" disabled={submitting} onClick={() => void handleLogin()}>
          {submitting ? "ログイン中..." : "ログイン"}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">パスワードをお忘れの場合は担当者にご連絡ください。</p>
      </div>
    </div>
  );
}
