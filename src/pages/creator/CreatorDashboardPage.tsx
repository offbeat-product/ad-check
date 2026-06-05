import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertCircle,
  CircleCheckBig,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchCreatorDashboard,
  type CreatorDashboardCreator,
  type CreatorDashboardProject,
} from "@/lib/creator-dashboard-rpc";
import { PROJECT_STATUS_CONFIG, canonicalProjectStatusForSelect } from "@/lib/process-config";
import { cn } from "@/lib/utils";

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

function ProjectCard({
  project,
  onOpen,
}: {
  project: CreatorDashboardProject;
  onOpen: (shareToken: string) => void;
}) {
  const inactive = !project.collaborator_is_active;
  const statusKey = canonicalProjectStatusForSelect(project.project_status);
  const statusCfg = PROJECT_STATUS_CONFIG[statusKey] ?? PROJECT_STATUS_CONFIG.in_progress;
  const invitedLabel = formatMaybeDate(project.invited_at);
  const deliveryLabel = formatMaybeDate(project.delivery_date);

  return (
    <button
      type="button"
      disabled={inactive}
      onClick={() => onOpen(project.share_token)}
      className={cn(
        "glass-card p-4 text-left w-full transition-colors",
        inactive
          ? "opacity-50 cursor-not-allowed"
          : "hover:border-primary/30 hover:bg-muted/20 cursor-pointer",
      )}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {project.client_name ? (
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {project.client_name}
            </span>
          ) : null}
          {inactive ? (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
              招待解除
            </Badge>
          ) : null}
          <Badge className={cn("text-[10px] h-5 px-1.5 ml-auto", statusCfg.badgeClass)}>
            {statusCfg.label}
          </Badge>
        </div>

        <h2 className="text-sm font-semibold leading-snug line-clamp-2">{project.project_name}</h2>

        {project.product_name ? (
          <p className="text-xs text-muted-foreground">{project.product_name}</p>
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {project.file_count} ファイル
          </span>
          {invitedLabel ? <span>招待日: {invitedLabel}</span> : null}
          {deliveryLabel ? <span>納品日: {deliveryLabel}</span> : null}
        </div>
      </div>
    </button>
  );
}

export default function CreatorDashboardPage() {
  const { invitationToken } = useParams<{ invitationToken: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [creator, setCreator] = useState<CreatorDashboardCreator | null>(null);
  const [projects, setProjects] = useState<CreatorDashboardProject[]>([]);

  const load = useCallback(async () => {
    const token = invitationToken?.trim();
    if (!token) {
      setErrorMessage("この招待リンクは無効です");
      setRetryable(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setRetryable(false);

    try {
      const result = await fetchCreatorDashboard(token);
      if (result.kind === "error") {
        if (result.code === "invalid_token") {
          setErrorMessage("この招待リンクは無効です");
        } else {
          setErrorMessage("アカウントが無効化されています。Off Beat 担当者にご連絡ください");
        }
        setCreator(null);
        setProjects([]);
        setLoading(false);
        return;
      }

      setCreator(result.creator);
      setProjects(result.projects);
    } catch {
      setErrorMessage("データの取得に失敗しました");
      setRetryable(true);
      setCreator(null);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [invitationToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const openProject = (shareToken: string) => {
    navigate(`/creator/${shareToken}`);
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

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-xl font-semibold">アクセスできません</h1>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          {retryable ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              再試行
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

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
          {creator ? (
            <div className="text-sm text-muted-foreground shrink-0">{creator.name} 様のマイページ</div>
          ) : null}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <section className="space-y-1">
          <h1 className="text-lg font-semibold">招待されている案件</h1>
          <p className="text-xs text-muted-foreground">
            案件を選ぶと、ファイルのアップロードや確認ができます。
          </p>
        </section>

        {projects.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-sm text-muted-foreground">招待されている案件はまだありません</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.collaborator_id} project={project} onOpen={openProject} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
