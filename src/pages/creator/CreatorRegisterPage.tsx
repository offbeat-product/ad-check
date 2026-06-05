import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, CircleCheckBig, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreatorRegistrationRecord {
  id: string;
  name: string;
  email: string;
}

type CreatorRegistrationErrorCode = "invalid_token" | "inactive_creator" | "already_registered";

function isRegistrationErrorCode(value: unknown): value is CreatorRegistrationErrorCode {
  return value === "invalid_token" || value === "inactive_creator" || value === "already_registered";
}

function isCreatorRegistrationRecord(value: unknown): value is CreatorRegistrationRecord {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.name === "string" && typeof obj.email === "string";
}

function getRpcErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" ? error : null;
}

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
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLoginButton, setShowLoginButton] = useState(false);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadCreator = useCallback(async () => {
    const token = invitationToken?.trim();
    if (!token) {
      setCreator(null);
      setErrorTitle("登録リンクが無効です");
      setErrorMessage("リンクが正しいかご確認ください");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorTitle(null);
    setErrorMessage(null);
    setShowLoginButton(false);
    setShowRetryButton(false);

    const { data: result, error } = await supabase.rpc("get_creator_for_registration", {
      p_invitation_token: token,
    });

    if (error) {
      setCreator(null);
      setErrorTitle("アクセスできません");
      setErrorMessage("データの取得に失敗しました");
      setShowRetryButton(true);
      setLoading(false);
      return;
    }

    const resultError = getRpcErrorCode(result);
    if (isRegistrationErrorCode(resultError)) {
      setCreator(null);

      if (resultError === "invalid_token") {
        setErrorTitle("登録リンクが無効です");
        setErrorMessage("リンクが正しいかご確認ください");
      } else if (resultError === "inactive_creator") {
        setErrorTitle("アカウントが無効化されています");
        setErrorMessage("Off Beat 担当者にご連絡ください");
      } else {
        setErrorTitle("すでに登録済みです");
        setErrorMessage("ログイン画面からログインしてください");
        setShowLoginButton(true);
      }

      setLoading(false);
      return;
    }

    if (!isCreatorRegistrationRecord(result)) {
      setCreator(null);
      setErrorTitle("アクセスできません");
      setErrorMessage("データの取得に失敗しました");
      setShowRetryButton(true);
      setLoading(false);
      return;
    }

    setCreator(result);
    setLoading(false);
  }, [invitationToken]);

  useEffect(() => {
    void loadCreator();
  }, [loadCreator]);

  const handleSubmit = async () => {
    if (!creator) return;
    if (password.length < 8) {
      setErrorTitle(null);
      setErrorMessage("パスワードは8文字以上で入力してください");
      return;
    }
    if (password !== passwordConfirm) {
      setErrorTitle(null);
      setErrorMessage("確認用パスワードが一致しません");
      return;
    }

    setSubmitting(true);
    setErrorTitle(null);
    setErrorMessage(null);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: creator.email,
        password,
        options: {
          data: { name: creator.name },
        },
      });

      if (signUpError) {
        if (signUpError.message?.toLowerCase().includes("already registered")) {
          setErrorTitle("メールアドレスがすでに登録されています");
          setErrorMessage("ログイン画面からログインしてください");
          setShowLoginButton(true);
        } else {
          setErrorTitle("アカウント作成に失敗しました");
          setErrorMessage(signUpError.message);
        }
        return;
      }

      const token = invitationToken?.trim();
      if (!token) {
        setErrorTitle("登録リンクが無効です");
        setErrorMessage("リンクが正しいかご確認ください");
        return;
      }

      const { data: linkResult, error: linkError } = await supabase.rpc("link_creator_to_auth_user", {
        p_invitation_token: token,
      });

      if (linkError) {
        setErrorTitle("登録に失敗しました");
        setErrorMessage("もう一度お試しください");
        return;
      }

      const linkResultError = getRpcErrorCode(linkResult);
      if (linkResultError) {
        setErrorTitle("登録処理でエラーが発生しました");
        setErrorMessage(`エラーコード: ${linkResultError}`);
        return;
      }

      navigate("/creator/account", { replace: true });
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

  if (!creator) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="glass-card w-full max-w-md p-6 space-y-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">{errorTitle ?? "登録できません"}</h1>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          {showRetryButton ? (
            <Button type="button" variant="outline" onClick={() => void loadCreator()}>
              再試行
            </Button>
          ) : null}
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
            {errorTitle ? <p className="font-medium">{errorTitle}</p> : null}
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
