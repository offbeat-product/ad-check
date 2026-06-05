import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, CircleCheckBig, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";

type CreatorRegistrationRecord = Pick<Tables<"creators">, "id" | "name" | "email" | "user_id" | "is_active">;

function CreatorLogo() {
  return (
    <div className="flex items-center gap-1.5 select-none" aria-hidden>
      <CircleCheckBig size={22} className="shrink-0 text-primary" strokeWidth={2.25} />
      <span className="bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent tracking-tight text-base font-bold">
        Ad Check
      </span>
    </div>
  );
}

export default function CreatorRegisterPage() {
  const { invitationToken } = useParams<{ invitationToken: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<CreatorRegistrationRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLoginButton, setShowLoginButton] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const loadCreator = useCallback(async () => {
    const token = invitationToken?.trim();
    if (!token) {
      setErrorMessage("無効な登録リンクです");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setShowLoginButton(false);

    const { data, error } = await supabase
      .from("creators")
      .select("id, name, email, user_id, is_active")
      .eq("invitation_token", token)
      .maybeSingle();

    if (error || !data) {
      setCreator(null);
      setErrorMessage("無効な登録リンクです");
      setLoading(false);
      return;
    }

    if (data.is_active === false) {
      setCreator(null);
      setErrorMessage("アカウントが無効化されています");
      setLoading(false);
      return;
    }

    if (data.user_id) {
      setCreator(null);
      setErrorMessage("既に登録済みです。ログイン画面からログインしてください");
      setShowLoginButton(true);
      setLoading(false);
      return;
    }

    setCreator(data);
    setLoading(false);
  }, [invitationToken]);

  useEffect(() => {
    void loadCreator();
  }, [loadCreator]);

  const handleSubmit = async () => {
    if (!creator) return;
    if (password.length < 8) {
      setErrorMessage("パスワードは8文字以上で入力してください");
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMessage("確認用パスワードが一致しません");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: creator.email,
        password,
        options: {
          data: { creator_id: creator.id, name: creator.name },
        },
      });

      if (signUpError) {
        setErrorMessage(signUpError.message);
        return;
      }

      const userId = signUpData.user?.id;
      if (!userId) {
        setErrorMessage("ユーザー作成結果を確認できませんでした。メール確認設定をご確認ください。");
        return;
      }

      const { error: updateError } = await supabase
        .from("creators")
        .update({ user_id: userId })
        .eq("id", creator.id);

      if (updateError) {
        setErrorMessage(`アカウント作成後の紐付けに失敗しました: ${updateError.message}`);
        return;
      }

      setCompleted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="glass-card w-full max-w-md p-6 space-y-5 text-center">
          <CreatorLogo />
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">アカウント登録が完了しました</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              これから受け取る案件用の URL から、すぐにアップロード画面にアクセスできるようになります。
              このページは閉じて構いません。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="glass-card w-full max-w-md p-6 space-y-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">登録できません</h1>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          {showLoginButton ? (
            <Button type="button" onClick={() => navigate("/creator/login")}>
              ログイン画面へ
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-md p-6 space-y-5">
        <CreatorLogo />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Ad Check アカウント登録</h1>
          <p className="text-sm text-muted-foreground">
            ようこそ、{creator.name} 様。クリエイター用アカウントを作成します。
          </p>
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">メールアドレス（変更不可）</Label>
            <Input value={creator.email} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">パスワード *</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">8文字以上、半角英数記号</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">パスワード（確認用）*</Label>
            <Input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} />
          </div>
        </div>

        <Button type="button" className="w-full" disabled={submitting} onClick={() => void handleSubmit()}>
          {submitting ? "作成中..." : "アカウント作成"}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          既に登録済みの場合は <Link to="/creator/login" className="text-primary underline">ログイン</Link> してください。
        </p>
      </div>
    </div>
  );
}
