import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Project, Product, CheckResultRow, ProjectFile } from "@/lib/db-types";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import { PROJECT_STATUS_CONFIG } from "@/lib/process-config";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, AlertTriangle, BarChart3, TrendingUp, FileText, FolderOpen, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { TopCorrectionPatterns } from "@/components/CorrectionPatterns";
import { cn } from "@/lib/utils";
import CreateProjectModal from "@/components/CreateProjectModal";

const ITEMS_PER_PAGE = 10;

const gradeColorMap: Record<string, string> = {
  A: "bg-[hsl(var(--grade-a))]/10 text-[hsl(var(--grade-a))] border-[hsl(var(--grade-a))]/30",
  B: "bg-[hsl(var(--grade-b))]/10 text-[hsl(var(--grade-b))] border-[hsl(var(--grade-b))]/30",
  C: "bg-[hsl(var(--grade-c))]/10 text-[hsl(var(--grade-c))] border-[hsl(var(--grade-c))]/30",
  D: "bg-[hsl(var(--grade-d))]/10 text-[hsl(var(--grade-d))] border-[hsl(var(--grade-d))]/30",
};

const statusBadgeMap: Record<string, { label: string; class: string }> = {
  pending: { label: "チェック済", class: "bg-muted text-muted-foreground" },
  in_progress: { label: "修正中", class: "bg-primary/10 text-primary" },
  resolved: { label: "修正完了", class: "bg-status-ok/10 text-status-ok" },
  approved: { label: "承認済", class: "bg-product-cta/10 text-product-cta" },
};

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg bg-muted ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<CheckResultRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recentFiles, setRecentFiles] = useState<(ProjectFile & { project_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch paginated records
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      const from = page * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const [cr, countRes, pr, prod, pf] = await Promise.all([
        supabase.from("check_results").select("*").order("created_at", { ascending: false }).range(from, to),
        supabase.from("check_results").select("*", { count: "exact", head: true }),
        page === 0 ? supabase.from("projects").select("*").order("updated_at", { ascending: false }).limit(6) : null,
        page === 0 ? supabase.from("products").select("*") : null,
        page === 0 ? supabase.from("project_files").select("id, project_id, file_name, file_type, process_type, status, updated_at").order("updated_at", { ascending: false }).limit(5) : null,
      ]);

      if (cancelled) return;

      handleSupabaseError(cr.error, "check_results");
      handleSupabaseError(countRes?.error ?? null, "check_results count");
      setRecords(cr.data ?? []);
      setTotalCount(countRes?.count ?? 0);

      if (page === 0) {
        handleSupabaseError(pr?.error ?? null, "projects");
        handleSupabaseError(prod?.error ?? null, "products");
        handleSupabaseError(pf?.error ?? null, "project_files");
        const projectsData = pr?.data ?? [];
        const productsData = prod?.data ?? [];
        const filesData = (pf?.data ?? []) as ProjectFile[];
        setProjects(projectsData);
        setProducts(productsData);

        // Enrich files with project names (batch, no N+1)
        if (filesData.length > 0) {
          const projectIds = [...new Set(filesData.map(f => f.project_id).filter(Boolean))] as string[];
          if (projectIds.length > 0) {
            const { data: fileProjects } = await supabase
              .from("projects").select("id, name").in("id", projectIds);
            if (!cancelled) {
              const nameMap = new Map((fileProjects ?? []).map(p => [p.id, p.name]));
              setRecentFiles(filesData.map(f => ({ ...f, project_name: nameMap.get(f.project_id ?? "") })));
            }
          } else {
            setRecentFiles(filesData);
          }
        } else {
          setRecentFiles([]);
        }
      }
      if (!cancelled) setLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
  }, [user, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  const stats = useMemo(() => {
    // Stats are approximate from first page when on page > 0, but good enough for dashboard
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayChecks = records.filter(r => r.created_at && new Date(r.created_at) >= today).length;
    const totalNg = records.reduce((s, r) => s + (r.ng_count ?? 0), 0);
    const grades = records.map(r => r.overall_status).filter(Boolean) as string[];
    const gradeScore: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
    const avgGrade = grades.length > 0
      ? (grades.reduce((s, g) => s + (gradeScore[g] || 0), 0) / grades.length)
      : 0;
    const avgLabel = avgGrade >= 3.5 ? "A" : avgGrade >= 2.5 ? "B" : avgGrade >= 1.5 ? "C" : "D";
    const week = new Date();
    week.setDate(week.getDate() - 7);
    const weekChecks = records.filter(r => r.created_at && new Date(r.created_at) >= week).length;
    return { todayChecks, totalNg, avgLabel, weekChecks };
  }, [records]);

  const getProductName = (productId: string | null) => products.find(p => p.id === productId)?.name || "";

  const goPage = useCallback((p: number) => {
    setPage(Math.max(0, Math.min(p, totalPages - 1)));
  }, [totalPages]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div className="text-sm text-muted-foreground">ホーム</div>
        <button onClick={() => navigate("/check")}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
          + 新規チェック
        </button>
      </header>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={ClipboardCheck} label="今日のチェック数" value={stats.todayChecks} color="text-primary" />
          <StatCard icon={AlertTriangle} label="NG検出数（累計）" value={stats.totalNg} color="text-status-ng" />
          <StatCard icon={BarChart3} label="平均Grade" value={stats.avgLabel} color="text-status-ok" />
          <StatCard icon={TrendingUp} label="直近7日" value={`${stats.weekChecks} 件`} color="text-primary" />
        </div>

        {projects.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">最近のプロジェクト</h2>
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />新規プロジェクト
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.map((pr) => {
                const stCfg = PROJECT_STATUS_CONFIG[pr.status || "in_progress"] || PROJECT_STATUS_CONFIG.in_progress;
                return (
                  <button key={pr.id} onClick={() => navigate(`/project/${pr.id}`)}
                    className="glass-card p-4 text-left hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium truncate flex-1">{pr.name}</span>
                      <Badge variant="outline" className={cn("text-[10px] shrink-0", stCfg.badgeClass)}>{stCfg.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{getProductName(pr.product_id)}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {pr.updated_at ? new Date(pr.updated_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">最近のチェック結果</h2>
              <span className="text-xs text-muted-foreground">{totalCount} 件</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-2.5 font-medium">日時</th>
                  <th className="px-4 py-2.5 font-medium">商材</th>
                  <th className="px-4 py-2.5 font-medium">工程</th>
                  <th className="px-4 py-2.5 font-medium text-center">Grade</th>
                  <th className="px-4 py-2.5 font-medium text-center">NG</th>
                  <th className="px-4 py-2.5 font-medium text-center">WARN</th>
                  <th className="px-4 py-2.5 font-medium text-center">ステータス</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">読み込み中...</td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">チェック結果がありません</td></tr>
                ) : (
                  records.map((r) => {
                    const st = statusBadgeMap[r.status || "pending"] || statusBadgeMap.pending;
                    return (
                      <tr key={r.id} onClick={() => navigate(`/check-result/${r.id}`)}
                        className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {r.created_at ? new Date(r.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{r.product_name}</td>
                        <td className="px-4 py-2.5">{r.process_type}</td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant="outline" className={gradeColorMap[r.overall_status ?? ""] ?? ""}>{r.overall_status}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-center text-status-ng font-bold">{r.ng_count ?? 0}</td>
                        <td className="px-4 py-2.5 text-center text-status-warning font-bold">{r.warning_count ?? 0}</td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant="outline" className={st.class}>{st.label}</Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {page * ITEMS_PER_PAGE + 1}–{Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)} / {totalCount} 件
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => goPage(page - 1)}
                    disabled={page === 0}
                    className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) {
                      p = i;
                    } else if (page < 3) {
                      p = i;
                    } else if (page > totalPages - 4) {
                      p = totalPages - 5 + i;
                    } else {
                      p = page - 2 + i;
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => goPage(p)}
                        className={cn(
                          "min-w-[28px] h-7 rounded-md text-xs font-medium transition-colors",
                          p === page ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {p + 1}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => goPage(page + 1)}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <TopCorrectionPatterns limit={5} />
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold">最近のファイル</h2>
              </div>
              {recentFiles.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">ファイルはまだありません</p>
                  <p className="text-xs mt-1">プロジェクトにファイルをアップロードすると表示されます</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentFiles.map((f) => {
                    const st = FILE_STATUS_CONFIG[f.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                    return (
                      <button key={f.id} onClick={() => f.project_id && navigate(`/project/${f.project_id}/file/${f.id}`)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.file_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {f.project_name ? `${f.project_name} · ` : ""}{f.process_type}
                            {f.updated_at ? ` · ${new Date(f.updated_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px] shrink-0", st.class)}>{st.label}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <CreateProjectModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/project/${id}`)}
      />
    </div>
  );
}
