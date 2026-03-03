import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Project, Product, CheckResultRow, ProjectFile } from "@/lib/db-types";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import { PROJECT_STATUS_CONFIG, getProcessLabel } from "@/lib/process-config";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, AlertTriangle, BarChart3, TrendingUp, FileText, FolderOpen, ChevronLeft, ChevronRight, Plus, RefreshCw, WifiOff, User, Target, CheckCircle } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { TopCorrectionPatterns } from "@/components/CorrectionPatterns";
import { cn } from "@/lib/utils";
import CreateProjectModal from "@/components/CreateProjectModal";
import { getSubmitLabel, getSubmitBadgeClass } from "@/lib/check-display";

const ITEMS_PER_PAGE = 10;

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

async function fetchWithRetry<T>(
  fn: () => PromiseLike<T>,
  retries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));
    }
  }
  throw new Error("fetchWithRetry exhausted");
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Phase 1: Projects (loaded immediately)
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Phase 2: Check results (loaded lazily)
  const [records, setRecords] = useState<CheckResultRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [checksLoading, setChecksLoading] = useState(true);
  const [checksLoaded, setChecksLoaded] = useState(false);
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  // Map check_result_id -> { projectId, fileId } for navigation
  const [checkFileMap, setCheckFileMap] = useState<Map<string, { projectId: string; fileId: string }>>(new Map());

  // Phase 3: Recent files (loaded lazily)
  const [recentFiles, setRecentFiles] = useState<(ProjectFile & { project_name?: string })[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);

  // KPI stats
  const [kpiDeadlineRate, setKpiDeadlineRate] = useState<number | null>(null);
  const [kpiFirstDraftRate, setKpiFirstDraftRate] = useState<number | null>(null);
  const [kpiLoaded, setKpiLoaded] = useState(false);

  const [fetchError, setFetchError] = useState(false);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  // Phase 1: Fetch projects & products only (lightweight, fast)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchProjects = async () => {
      setProjectsLoading(true);
      setFetchError(false);
      try {
        const pr = await fetchWithRetry(() =>
          supabase.from("projects").select("*").order("updated_at", { ascending: false }).limit(6)
        );
        if (cancelled) return;
        handleSupabaseError(pr.error, "projects");
        setProjects(pr.data ?? []);

        const prod = await fetchWithRetry(() =>
          supabase.from("products").select("*").limit(100)
        );
        if (cancelled) return;
        handleSupabaseError(prod.error, "products");
        setProducts(prod.data ?? []);

        setProjectsLoading(false);
      } catch (e) {
        console.error("[Dashboard] Projects fetch failed:", e);
        if (!cancelled) {
          setFetchError(true);
          setProjectsLoading(false);
        }
      }
    };

    fetchProjects();
    return () => { cancelled = true; };
  }, [user, refetchKey]);

  // Phase 2: Fetch check results (deferred, paginated)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchChecks = async () => {
      setChecksLoading(true);
      const from = page * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      try {
        const cr = await fetchWithRetry(() =>
          supabase.from("check_results").select("*").order("created_at", { ascending: false }).range(from, to)
        );
        if (cancelled) return;
        handleSupabaseError(cr.error, "check_results");
        setRecords(cr.data ?? []);

        // Resolve check_result -> project_file mapping for navigation
        const crIds = (cr.data ?? []).map(r => r.id);
        if (crIds.length > 0) {
          const { data: pfLinks } = await supabase
            .from("project_files")
            .select("id, project_id, check_result_id")
            .in("check_result_id", crIds);
          if (!cancelled && pfLinks) {
            const map = new Map<string, { projectId: string; fileId: string }>();
            pfLinks.forEach((pf: { id: string; project_id: string | null; check_result_id: string | null }) => {
              if (pf.check_result_id && pf.project_id) {
                map.set(pf.check_result_id, { projectId: pf.project_id, fileId: pf.id });
              }
            });
            setCheckFileMap(map);
          }
        }

        // Resolve user profiles
        const userIds = [...new Set((cr.data ?? []).map(r => r.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.rpc("get_profiles_by_ids", { p_ids: userIds });
          if (!cancelled && profiles) {
            const map = new Map<string, string>();
            profiles.forEach((p: { id: string; display_name: string; email: string }) => {
              map.set(p.id, p.display_name || p.email);
            });
            setProfileMap(map);
          }
        }

        const countRes = await fetchWithRetry(() =>
          supabase.from("check_results").select("*", { count: "exact", head: true })
        );
        if (cancelled) return;
        handleSupabaseError(countRes.error, "check_results count");
        setTotalCount(countRes.count ?? 0);

        setChecksLoaded(true);
        setChecksLoading(false);
      } catch (e) {
        console.error("[Dashboard] Check results fetch failed:", e);
        if (!cancelled) setChecksLoading(false);
      }
    };

    // Defer check results loading by 300ms to let projects render first
    const timer = setTimeout(fetchChecks, page === 0 ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user, page, refetchKey]);

  // Phase 3: Fetch recent files (deferred further)
  useEffect(() => {
    if (!user || filesLoaded) return;
    let cancelled = false;

    const fetchFiles = async () => {
      try {
        const pf = await fetchWithRetry(() =>
          supabase.from("project_files")
            .select("id, project_id, file_name, file_type, process_type, status, updated_at")
            .order("updated_at", { ascending: false }).limit(5)
        );
        if (cancelled) return;
        handleSupabaseError(pf.error, "project_files");
        const filesData = (pf.data ?? []) as ProjectFile[];

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
        }
        if (!cancelled) setFilesLoaded(true);
      } catch (e) {
        console.warn("[Dashboard] Recent files fetch failed:", e);
      }
    };

    // Defer file loading by 800ms
    const timer = setTimeout(fetchFiles, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user, filesLoaded, refetchKey]);

  // Realtime: auto-refresh check results only (single channel)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dashboard-check-results")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_results" },
        () => { setRefetchKey((k) => k + 1); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // KPI: fetch current month client deadline compliance & client first draft pass rate
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchKpi = async () => {
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const [procRes, fileRes] = await Promise.all([
          // クライアント納期遵守率: クライアント期限までにFIX済みか
          supabase.from("project_processes").select("status, client_deadline, updated_at")
            .not("client_deadline", "is", null)
            .gte("updated_at", monthStart).lte("updated_at", monthEnd),
          // クライアント初稿合格率: submission_type=client, v1がFIX済みか
          supabase.from("project_files").select("status, version_number, submission_type, created_at")
            .eq("version_number", 1).eq("submission_type", "client")
            .gte("created_at", monthStart).lte("created_at", monthEnd),
        ]);
        if (cancelled) return;

        // 納期遵守率: クライアント期限内にFIX済みの工程
        const procs = procRes.data ?? [];
        const onTime = procs.filter((p: any) => {
          if (!p.client_deadline) return false;
          const completed = new Date(p.updated_at);
          const deadline = new Date(p.client_deadline + "T23:59:59");
          return completed <= deadline;
        }).length;
        const procsWithDeadline = procs.filter((p: any) => p.client_deadline).length;
        setKpiDeadlineRate(procsWithDeadline > 0 ? Math.round((onTime / procsWithDeadline) * 100) : null);

        // 初稿合格率: クライアント提出v1でFIX済み
        const fFiles = fileRes.data ?? [];
        const fixed = fFiles.filter((f: any) => f.status === "fixed").length;
        setKpiFirstDraftRate(fFiles.length > 0 ? Math.round((fixed / fFiles.length) * 100) : null);

        setKpiLoaded(true);
      } catch (e) {
        console.warn("[Dashboard] KPI fetch failed:", e);
      }
    };
    const timer = setTimeout(fetchKpi, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user, refetchKey]);

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthChecks = records.filter(r => r.created_at && new Date(r.created_at) >= monthStart).length;
    const totalNg = records.reduce((s, r) => s + (r.ng_count ?? 0), 0);
    const okCount = records.filter(r => (r.ng_count ?? 0) === 0).length;
    const okRate = records.length > 0 ? Math.round((okCount / records.length) * 100) : 0;
    const week = new Date();
    week.setDate(week.getDate() - 7);
    const weekChecks = records.filter(r => r.created_at && new Date(r.created_at) >= week).length;
    return { monthChecks, totalNg, okRate, weekChecks };
  }, [records]);

  const getProductName = (productId: string | null) => products.find(p => p.id === productId)?.name || "";

  const goPage = useCallback((p: number) => {
    setPage(Math.max(0, Math.min(p, totalPages - 1)));
  }, [totalPages]);

  if (fetchError && projects.length === 0) {
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
            onClick={() => { setRefetchKey(k => k + 1); setFilesLoaded(false); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="h-4 w-4" />再試行
          </button>
        </div>
      </div>
    );
  }

  const loading = projectsLoading;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border px-4 md:px-6 py-3 flex items-center justify-between bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <h1 className="text-sm font-semibold">{new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long" })}</h1>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => setCreateOpen(true)}
            className="px-3 md:px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs md:text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5">
            <Plus className="h-4 w-4" />新規プロジェクトを作成
          </button>
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Stats - show skeleton while checks loading */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {checksLoaded ? (
            <>
              <StatCard icon={ClipboardCheck} label="今月のチェック数" value={stats.monthChecks} color="text-primary" />
              <StatCard icon={Target} label="納期遵守率（クライアント提出）" value={kpiLoaded ? (kpiDeadlineRate !== null ? `${kpiDeadlineRate}%` : "—") : "..."} color="text-primary" />
              <StatCard icon={CheckCircle} label="初稿合格率（クライアント提出）" value={kpiLoaded ? (kpiFirstDraftRate !== null ? `${kpiFirstDraftRate}%` : "—") : "..."} color="text-status-ok" />
            </>
          ) : (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card p-4 flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-muted w-10 h-10 animate-pulse" />
                <div>
                  <div className="h-3 w-16 bg-muted animate-pulse rounded mb-1" />
                  <div className="h-6 w-12 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Projects - loaded first (Phase 1) */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card p-4 space-y-2">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : projects.length > 0 && (
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
          {/* Check results table - Phase 2 */}
          <div className="lg:col-span-3 glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">最近のチェック結果</h2>
              <span className="text-xs text-muted-foreground">{checksLoaded ? `${totalCount} 件` : "..."}</span>
            </div>
            {/* Desktop table */}
            <table className="w-full text-xs hidden md:table">
              <thead>
                 <tr className="border-b border-border text-muted-foreground text-left">
                   <th className="px-3 py-2 font-medium whitespace-nowrap">日時</th>
                   <th className="px-3 py-2 font-medium whitespace-nowrap">実行者</th>
                   <th className="px-3 py-2 font-medium whitespace-nowrap">クライアント</th>
                   <th className="px-3 py-2 font-medium whitespace-nowrap">商材</th>
                   <th className="px-3 py-2 font-medium whitespace-nowrap">工程</th>
                 </tr>
              </thead>
              <tbody>
                {checksLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-3 py-3"><div className="h-4 w-20 bg-muted animate-pulse rounded" /></td>
                      <td className="px-3 py-3"><div className="h-4 w-16 bg-muted animate-pulse rounded" /></td>
                      <td className="px-3 py-3"><div className="h-4 w-20 bg-muted animate-pulse rounded" /></td>
                      <td className="px-3 py-3"><div className="h-4 w-24 bg-muted animate-pulse rounded" /></td>
                      <td className="px-3 py-3"><div className="h-4 w-16 bg-muted animate-pulse rounded" /></td>
                    </tr>
                  ))
                ) : records.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">チェック結果がありません</td></tr>
                ) : (
                  records.map((r) => (
                    <tr key={r.id} onClick={() => {
                        const link = checkFileMap.get(r.id);
                        if (link) navigate(`/project/${link.projectId}/file/${link.fileId}`);
                      }}
                      className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {profileMap.get(r.user_id) || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.client_name}</td>
                      <td className="px-3 py-2 font-medium">{r.product_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{getProcessLabel(r.process_type)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-border">
              {checksLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 space-y-2">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                ))
              ) : records.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">チェック結果がありません</div>
              ) : (
                records.map((r) => (
                  <button key={r.id} onClick={() => {
                      const link = checkFileMap.get(r.id);
                      if (link) navigate(`/project/${link.projectId}/file/${link.fileId}`);
                    }}
                    className="w-full p-4 text-left hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{r.product_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{profileMap.get(r.user_id) || "—"}</span>
                      <span>·</span>
                      <span>{r.client_name}</span>
                      <span>·</span>
                      <span>{getProcessLabel(r.process_type)}</span>
                    </div>
                  </button>
                ))
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

          {/* Right sidebar - Phase 3 */}
          <div className="lg:col-span-2 space-y-4">
            <TopCorrectionPatterns limit={3} />
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold">最近のファイル</h2>
              </div>
              {!filesLoaded ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 w-28 bg-muted animate-pulse rounded" />
                        <div className="h-2 w-20 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentFiles.length === 0 ? (
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
