import { AlertCircle, CircleCheckBig } from "lucide-react";

export default function CreatorLinkInvalidPage() {
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
        <h1 className="text-xl font-semibold">リンクが無効です</h1>
        <p className="text-sm text-muted-foreground">
          この共有リンクは無効か、招待が解除されています。担当者にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
