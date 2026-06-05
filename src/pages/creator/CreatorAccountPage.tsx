import { useEffect, useState } from "react";
import { CircleCheckBig, LogOut } from "lucide-react";
import { CreatorAuthGuard } from "@/components/creator/CreatorAuthGuard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

function CreatorAccountContent() {
  const { user, signOut } = useAuth();
  const [creatorName, setCreatorName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from("creators")
      .select("name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setCreatorName(data?.name ?? null);
      });
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-md p-6 space-y-6">
        <div className="flex items-center gap-1.5 select-none" aria-hidden>
          <CircleCheckBig size={22} className="shrink-0 text-primary" strokeWidth={2.25} />
          <span className="bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent tracking-tight text-base font-bold">
            Ad Check
          </span>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{creatorName ?? user?.email ?? "クリエイター"} 様</h1>
          <p className="text-sm text-muted-foreground">ログイン中</p>
        </div>

        <div className="border-t border-border pt-5 space-y-3">
          <h2 className="text-sm font-semibold">案件への直接アクセス</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            ディレクターから受け取った案件 URL をブラウザで開いてください。
            ログイン状態が保持されているので、そのまま案件画面が表示されます。
          </p>
        </div>

        <Button type="button" variant="outline" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </div>
  );
}

export default function CreatorAccountPage() {
  return (
    <CreatorAuthGuard>
      <CreatorAccountContent />
    </CreatorAuthGuard>
  );
}
