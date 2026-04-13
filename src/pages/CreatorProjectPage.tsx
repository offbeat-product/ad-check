import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCreatorProject } from "@/hooks/useCreatorProject";
import { useCreatorProcesses } from "@/hooks/useCreatorProcesses";
import { useCreatorPatterns } from "@/hooks/useCreatorPatterns";
import { useCreatorCommentCounts } from "@/hooks/useCreatorCommentCounts";
import { CreatorFileUploadSection } from "@/components/creator/CreatorFileUploadSection";
import { AlertCircle, Loader2, CircleCheckBig, ImageIcon, LayoutGrid, Video } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROJECT_STATUS_CONFIG, canonicalProjectStatusForSelect } from "@/lib/process-config";

function formatMaybeDate(value: string | null): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return format(d, "yyyy/MM/dd");
  } catch {
    return value;
  }
}

function getStatusLabel(status: string | null): string | null {
  if (!status) return null;
  const key = status.toLowerCase();
  const map: Record<string, string> = {
    in_progress: "進行中",
    active: "進行中",
    completed: "完了",
    done: "完了",
    paused: "保留中",
    archived: "アーカイブ",
  };
  return map[key] ?? status;
}

function getCreativeTypeLabel(creativeType: string | null): string | null {
  if (!creativeType) return null;
  const key = creativeType.toLowerCase();
  const map: Record<string, string> = {
    video: "動画",
    banner: "バナー",
    common: "共通",
  };
  return map[key] ?? creativeType;
}

export default function CreatorProjectPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { project, files, loading, error, refetch } = useCreatorProject(shareToken);
  const { processes, loading: processesLoading } = useCreatorProcesses(shareToken);
  const { patterns, loading: patternsLoading } = useCreatorPatterns(shareToken);
  const { counts: commentCounts, refetch: refetchCommentCounts } = useCreatorCommentCounts(shareToken);

  useEffect(() => {
    const token = shareToken?.trim();
    const pid = project?.project_id;
    if (!token || !pid) return;
    void supabase.rpc("track_creator_access", { p_share_token: token }).then(({ error: rpcErr }) => {
      if (rpcErr) console.warn("[CreatorProjectPage] access tracking failed:", rpcErr.message);
    });
  }, [shareToken, project?.project_id]);

  if (loading || processesLoading || patternsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-xl font-semibold">アクセスできません</h1>
          <p className="text-sm text-muted-foreground">
            {error ?? "この共有リンクは無効か、期限切れです。"}
            <br />
            担当者にお問い合わせください。
          </p>
        </div>
      </div>
    );
  }

  const deadlineLabel = formatMaybeDate(project.deadline);
  const overallLabel = formatMaybeDate(project.overall_deadline);
  const statusKey = canonicalProjectStatusForSelect(project.status);
  const statusCfg = PROJECT_STATUS_CONFIG[statusKey] ?? PROJECT_STATUS_CONFIG.in_progress;
  const statusLabel = getStatusLabel(project.status);
  const creativeTypeLabel = getCreativeTypeLabel(project.creative_type);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 select-none" aria-hidden>
              <CircleCheckBig size={22} className="shrink-0 text-primary" strokeWidth={2.25} />
              <span className="bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent tracking-tight text-base font-bold">
                Ad Check
              </span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground shrink-0">{project.creator_name} さん</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <section className="glass-card p-6 space-y-3">
          <h1 className="text-xl font-semibold">{project.project_name}</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {project.client_name && (
              <div>
                <div className="text-muted-foreground text-xs">クライアント</div>
                <div>{project.client_name}</div>
              </div>
            )}
            {project.product_name && (
              <div>
                <div className="text-muted-foreground text-xs">商材</div>
                <div>{project.product_name}</div>
              </div>
            )}
            {project.ob_pm && (
              <div>
                <div className="text-muted-foreground text-xs">担当 PM</div>
                <div>{project.ob_pm}</div>
              </div>
            )}
            {deadlineLabel && (
              <div>
                <div className="text-muted-foreground text-xs">納期</div>
                <div>{deadlineLabel}</div>
              </div>
            )}
            {overallLabel && (
              <div>
                <div className="text-muted-foreground text-xs">全体納期</div>
                <div>{overallLabel}</div>
              </div>
            )}
            {statusLabel && (
              <div>
                <div className="text-muted-foreground text-xs">ステータス</div>
                <Badge
                  variant="outline"
                  className={cn("mt-0.5 text-xs font-medium gap-1 border-0", statusCfg.badgeClass)}
                >
                  <span className={cn("w-2 h-2 rounded-full shrink-0", statusCfg.dotClass)} />
                  {statusCfg.label}
                </Badge>
              </div>
            )}
            {creativeTypeLabel && (
              <div>
                <div className="text-muted-foreground text-xs">制作種別</div>
                {(project.creative_type ?? "video") === "banner" ? (
                  <Badge
                    variant="outline"
                    className="mt-0.5 text-xs font-medium gap-1 shrink-0 border-0 bg-[#7C7AFF]/10 text-[#7C7AFF]"
                  >
                    <ImageIcon className="h-3 w-3" aria-hidden />
                    静止画バナー
                  </Badge>
                ) : (project.creative_type ?? "video") === "mixed" ? (
                  <Badge
                    variant="outline"
                    className="mt-0.5 text-xs font-medium gap-1 shrink-0 border-0 bg-amber-500/10 text-amber-600 dark:text-amber-500"
                  >
                    <LayoutGrid className="h-3 w-3" aria-hidden />
                    混合
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="mt-0.5 text-xs font-medium gap-1 shrink-0 border-0 bg-primary/10 text-primary"
                  >
                    <Video className="h-3 w-3" aria-hidden />
                    {creativeTypeLabel ?? "動画"}
                  </Badge>
                )}
              </div>
            )}
          </div>
          {project.description && (
            <div className="pt-3 border-t border-border">
              <div className="text-muted-foreground text-xs mb-1">案件説明</div>
              <p className="text-sm whitespace-pre-wrap">{project.description}</p>
            </div>
          )}
        </section>

        {shareToken && (
          <CreatorFileUploadSection
            shareToken={shareToken}
            projectId={project.project_id}
            files={files}
            processes={processes}
            patterns={patterns}
            commentCounts={commentCounts}
            onUploadComplete={() => {
              void refetch();
              void refetchCommentCounts();
            }}
          />
        )}
      </main>
    </div>
  );
}
