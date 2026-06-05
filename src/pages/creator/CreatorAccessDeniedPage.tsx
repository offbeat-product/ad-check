import { AlertCircle, CircleCheckBig, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function CreatorAccessDeniedPage() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-md p-6 space-y-4 text-center">
        <div className="flex items-center justify-center gap-1.5 select-none" aria-hidden>
          <CircleCheckBig size={22} className="shrink-0 text-primary" strokeWidth={2.25} />
          <span className="bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent tracking-tight text-base font-bold">
            Ad Check
          </span>
        </div>
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h1 className="text-xl font-semibold">アクセス権限がありません</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          このリンクは別のクリエイター向けに発行されています。
          ログアウトして該当アカウントでログインし直してください。
        </p>
        <Button type="button" variant="outline" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </div>
  );
}
