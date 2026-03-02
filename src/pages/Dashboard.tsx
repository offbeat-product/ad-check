import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Project, Product, CheckResultRow, ProjectFile } from "@/lib/db-types";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import { PROJECT_STATUS_CONFIG, getProcessLabel } from "@/lib/process-config";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, AlertTriangle, BarChart3, TrendingUp, FileText, FolderOpen, ChevronLeft, ChevronRight, Plus, RefreshCw, WifiOff } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { TopCorrectionPatterns } from "@/components/CorrectionPatterns";
import { cn } from "@/lib/utils";
import CreateProjectModal from "@/components/CreateProjectModal";
import { getSubmitLabel, getSubmitBadgeClass } from "@/lib/check-display";

const ITEMS_PER_PAGE = 10;

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
  const [fetchError, setFetchError] = useState(false);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  // Fetch paginated records
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchData = async (retryCount = 0) => {
      setLoading(true);
      setFetchError(false);
      const from = page * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      try {
        // Sequential batches to reduce concurrent DB connections
        // Batch 1: Core check results
        const cr = await supabase.from("check_results").select("*").order("created_at", { ascending: false }).range(from, to);
        if (cancelled) return;
        handleSupabaseError(cr.error, "check_results");
        setRecords(cr.data ?? []);

        const countRes = await supabase.from("check_results").select("*", { count: "exact", head: true });
        if (cancelled) return;
        handleSupabaseError(countRes?.error ?? null, "check_results count");
        setTotalCount(countRes?.count ?? 0);

        // Batch 2: Supporting data (only on first page)
        if (page === 0) {
          const pr = await supabase.from("projects").select("*").order("updated_at", { ascending: false }).limit(6);
          if (cancelled) return;
          handleSupabaseError(pr?.error ?? null, "projects");
          setProjects(pr?.data ?? []);

          const prod = await supabase.from("products").select("*");
          if (cancelled) return;
          handleSupabaseError(prod?.error ?? null, "products");
          setProducts(prod?.data ?? []);

          const pf = await supabase.from("project_files").select("id, project_id, file_name, file_type, process_type, status, updated_at").order("updated_at", { ascending: false }).limit(5);
          if (cancelled) return;
          handleSupabaseError(pf?.error ?? null, "project_files");
          const filesData = (pf?.data ?? []) as ProjectFile[];

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
      } catch (e) {
        // Network error — retry up to 3 times with exponential backoff
        if (retryCount < 3 && !cancelled) {
          console.warn(`[Dashboard] Fetch failed (attempt ${retryCount + 1}), retrying...`, e);
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, retryCount), 8000)));
          return fetchData(retryCount + 1);
        }
        console.error("[Dashboard] Fetch failed after retries:", e);
        if (!cancelled) {
          setFetchError(true);
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [user, page, refetchKey]);

  // Realtime: auto-refresh when check_results change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dashboard-check-results")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "check_results" },
        () => { setRefetchKey((k) => k + 1); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayChecks = records.filter(r => r.created_at && new Date(r.created_at) >= today).length;
    const totalNg = records.reduce((s, r) => s + (r.ng_count ?? 0), 0);
    const okCount = records.filter(r => {
      const s = (r.overall_status || "").toUpperCase();
      return s === "A" || s === "B";
    }).length;
    const okRate = records.length > 0 ? Math.round((okCount / records.length) * 100) : 0;
    const week = new Date();
    week.setDate(week.getDate() - 7);
    const weekChecks = records.filter(r => r.created_at && new Date(r.created_at) >= week).length;
    return { todayChecks, totalNg, okRate, weekChecks };
  }, [records]);

  const getProductName = (productId: string | null) => products.find(p => p.id === productId)?.name || "";

  const goPage = useCallback((p: number) => {
    setPage(Math.max(0, Math.min(p, totalPages - 1)));
  }, [totalPages]);

  if (fetchError && records.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <WifiOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">接続がタイムアウトしました</h2>
          <p className="text-sm text-muted-foreground">
            サーバーへの接続が混雑しています。しばらく待ってから再試行してください。
          </p>
          <button
            onClick={() => setRefetchKey(k => k + 1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="h-4 w-4" />再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border px-4 md:px-6 py-3 flex items-center justify-between bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div />
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => navigate("/check")}
            className="px-3 md:px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs md:text-sm font-semibold hover:opacity-90 transition-opacity">
            + 新規チェック
          </button>
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={ClipboardCheck} label="今日のチェック数" value={stats.todayChecks} color="text-primary" />
          <StatCard icon={AlertTriangle} label="修正必須（累計）" value={stats.totalNg} color="text-status-ng" />
          <StatCard icon={BarChart3} label="GO率" value={`${stats.okRate}%`} color="text-status-ok" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">最近のチェック結果</h2>
              <span className="text-xs text-muted-foreground">{totalCount} 件</span>
            </div>
            {/* Desktop table */}
            <table className="w-full text-xs hidden md:table">
              <thead>
                 <tr className="border-b border-border text-muted-foreground text-left">
                   <th className="px-3 py-2 font-medium whitespace-nowrap">日時</th>
                   <th className="px-3 py-2 font-medium whitespace-nowrap">商材</th>
                   <th className="px-3 py-2 font-medium whitespace-nowrap">工程</th>
                   <th className="px-3 py-2 font-medium text-center whitespace-nowrap">判定</th>
                   <th className="px-3 py-2 font-medium text-center whitespace-nowrap">修正必須</th>
                   <th className="px-3 py-2 font-medium text-center whitespace-nowrap">要確認</th>
                   <th className="px-3 py-2 font-medium text-center whitespace-nowrap">ステータス</th>
                 </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><div className="h-4 w-20 bg-muted animate-pulse rounded" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-24 bg-muted animate-pulse rounded" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-16 bg-muted animate-pulse rounded" /></td>
                      <td className="px-4 py-3 text-center"><div className="h-5 w-14 bg-muted animate-pulse rounded-full mx-auto" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-8 bg-muted animate-pulse rounded mx-auto" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-8 bg-muted animate-pulse rounded mx-auto" /></td>
                      <td className="px-4 py-3 text-center"><div className="h-5 w-16 bg-muted animate-pulse rounded-full mx-auto" /></td>
                    </tr>
                  ))
                ) : records.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">チェック結果がありません</td></tr>
                ) : (
                  records.map((r) => {
                    const st = statusBadgeMap[r.status || "pending"] || statusBadgeMap.pending;
                    return (
                      <tr key={r.id} onClick={() => navigate(`/check-result/${r.id}`)}
                        className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                        </td>
                        <td className="px-3 py-2 font-medium">{r.product_name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{getProcessLabel(r.process_type)}</td>
                         <td className="px-3 py-2 text-center">
                           <Badge className={cn("text-[10px] font-bold", getSubmitBadgeClass(r.overall_status))}>
                             {getSubmitLabel(r.overall_status).label}
                           </Badge>
                         </td>
                         <td className="px-3 py-2 text-center text-status-ng font-bold">{r.ng_count ?? 0}</td>
                         <td className="px-3 py-2 text-center text-status-warning font-bold">{r.warning_count ?? 0}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="outline" className={cn("text-[10px]", st.class)}>{st.label}</Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-border">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 space-y-2">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                ))
              ) : records.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">チェック結果がありません</div>
              ) : (
                records.map((r) => {
                  const st = statusBadgeMap[r.status || "pending"] || statusBadgeMap.pending;
                  return (
                    <button key={r.id} onClick={() => navigate(`/check-result/${r.id}`)}
                      className="w-full p-4 text-left hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{r.product_name}</span>
                        <Badge className={cn("text-[10px] font-bold", getSubmitBadgeClass(r.overall_status))}>
                          {getSubmitLabel(r.overall_status).label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{getProcessLabel(r.process_type)}</span>
                        <span>·</span>
                        <span className="text-status-ng">修正必須 {r.ng_count ?? 0}</span>
                        <span className="text-status-warning">要確認 {r.warning_count ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {r.created_at ? new Date(r.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px]", st.class)}>{st.label}</Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

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
            <TopCorrectionPatterns limit={3} />
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
                            {f.project_name ? `${f.project_name} · ` : ""}{getProcessLabel(f.process_type)}
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
