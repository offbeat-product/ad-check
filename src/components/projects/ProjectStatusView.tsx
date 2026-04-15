import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useProjectStatusSummary, type ProjectStatusSummary } from "@/hooks/useProjectStatusSummary";
import { ProjectStatusBadges } from "@/components/projects/ProjectStatusBadges";
import { CLSubmitDialog } from "@/components/projects/CLSubmitDialog";
import { FixConfirmDialog } from "@/components/projects/FixConfirmDialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SectionKey = "initial_check_pending" | "cl_submit_ready" | "fix_ready" | "completed";

const SECTION_CONFIG: Record<
  SectionKey,
  { label: string; emoji: string; description: string; defaultCollapsed: boolean }
> = {
  initial_check_pending: {
    label: "初稿チェック前案件",
    emoji: "⚪",
    description: "uploaded / checking / internal_revision のみ、またはファイルなし（CL・FIX の対象外）",
    defaultCollapsed: false,
  },
  cl_submit_ready: {
    label: "CL提出可能案件",
    emoji: "🔵",
    description: "checked のルートファイルがあり、クライアント提出可能",
    defaultCollapsed: false,
  },
  fix_ready: {
    label: "FIX確定可能案件",
    emoji: "🟣",
    description: "client_review があり FIX 確定可能（checked があれば CL提出も併記）",
    defaultCollapsed: false,
  },
  completed: {
    label: "FIX済案件",
    emoji: "🟢",
    description: "ルートファイルがすべて FIX 済み",
    defaultCollapsed: true,
  },
};

const SECTION_ORDER: SectionKey[] = [
  "initial_check_pending",
  "cl_submit_ready",
  "fix_ready",
  "completed",
];

function categorizeProject(p: ProjectStatusSummary): SectionKey {
  if (p.total > 0 && p.count_fixed === p.total) return "completed";
  if (p.count_client_review > 0) return "fix_ready";
  if (p.count_checked > 0) return "cl_submit_ready";
  return "initial_check_pending";
}

function sortProjects(projects: ProjectStatusSummary[]): ProjectStatusSummary[] {
  return [...projects].sort((a, b) => {
    const dateA = a.overall_deadline || a.deadline;
    const dateB = b.overall_deadline || b.deadline;
    if (dateA && dateB) {
      if (dateA !== dateB) return dateA.localeCompare(dateB);
    } else if (dateA) {
      return -1;
    } else if (dateB) {
      return 1;
    }
    return a.project_name.localeCompare(b.project_name, "ja");
  });
}

export function ProjectStatusView() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useProjectStatusSummary();
  const [clSubmitTarget, setClSubmitTarget] = useState<ProjectStatusSummary | null>(null);
  const [fixTarget, setFixTarget] = useState<ProjectStatusSummary | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(
    () => new Set(SECTION_ORDER.filter((k) => SECTION_CONFIG[k].defaultCollapsed))
  );

  const sectioned = useMemo(() => {
    const groups: Record<SectionKey, ProjectStatusSummary[]> = {
      initial_check_pending: [],
      cl_submit_ready: [],
      fix_ready: [],
      completed: [],
    };
    for (const p of data) {
      groups[categorizeProject(p)].push(p);
    }
    for (const key of SECTION_ORDER) {
      groups[key] = sortProjects(groups[key]);
    }
    return groups;
  }, [data]);

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-destructive py-4">{error}</div>;
  }

  if (data.length === 0) {
    return <div className="text-sm text-muted-foreground py-12 text-center">案件がありません</div>;
  }

  const totalCount = data.length;
  const clSubmitSectionCount = sectioned.cl_submit_ready.length;
  const fixReadySectionCount = sectioned.fix_ready.length;

  return (
    <>
      <div className="flex items-center gap-4 mb-4 px-1 text-sm flex-wrap">
        <span className="text-muted-foreground">全{totalCount}件</span>
        <span className="text-muted-foreground">·</span>
        <span>
          CL提出可能 <strong className="text-foreground">{clSubmitSectionCount}</strong> 件
        </span>
        <span>
          FIX確定可能 <strong className="text-foreground">{fixReadySectionCount}</strong> 件
        </span>
      </div>

      <div className="space-y-6">
        {SECTION_ORDER.map((sectionKey) => {
          const projects = sectioned[sectionKey];
          const config = SECTION_CONFIG[sectionKey];
          const isCollapsed = collapsedSections.has(sectionKey);

          if (projects.length === 0) return null;

          return (
            <section key={sectionKey} className="min-w-0">
              <button
                type="button"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 w-full text-left rounded-md hover:bg-accent/50 px-1 py-1 -mx-1"
                onClick={() => toggleSection(sectionKey)}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="text-base shrink-0" aria-hidden>
                  {config.emoji}
                </span>
                <span className="font-semibold shrink-0">{config.label}</span>
                <span className="text-sm text-muted-foreground shrink-0">({projects.length}件)</span>
                <span className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-2 basis-full sm:basis-auto">
                  {config.description}
                </span>
              </button>

              {!isCollapsed && (
                <div className="border rounded-lg overflow-hidden overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[280px] max-w-[280px]">案件名</TableHead>
                        <TableHead className="min-w-[120px]">クライアント</TableHead>
                        <TableHead className="min-w-[120px]">商材</TableHead>
                        <TableHead className="min-w-[100px]">納品日</TableHead>
                        <TableHead className="min-w-[280px]">ステータス</TableHead>
                        <TableHead className="min-w-[200px] text-right">アクション</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects.map((p) => (
                        <TableRow key={p.project_id}>
                          <TableCell className="max-w-[280px]">
                            <button
                              type="button"
                              className="text-left hover:underline font-medium block w-full truncate"
                              onClick={() => navigate(`/project/${p.project_id}`)}
                              title={p.project_name}
                            >
                              {p.project_name}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm">{p.client_name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{p.product_name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{p.overall_deadline ?? p.deadline ?? "—"}</TableCell>
                          <TableCell>
                            <ProjectStatusBadges
                              counts={{
                                uploaded: p.count_uploaded,
                                checking: p.count_checking,
                                checked: p.count_checked,
                                internal_revision: p.count_internal_revision,
                                client_review: p.count_client_review,
                                fixed: p.count_fixed,
                              }}
                              total={p.total}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {p.ready_for_cl_submit === 0 && p.ready_for_fix === 0 ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : (
                              <div className="flex items-center gap-2 justify-end flex-wrap">
                                {p.ready_for_cl_submit > 0 && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setClSubmitTarget(p)}
                                  >
                                    CL提出 {p.ready_for_cl_submit} →
                                  </Button>
                                )}
                                {p.ready_for_fix > 0 && (
                                  <Button size="sm" type="button" onClick={() => setFixTarget(p)}>
                                    FIX確定 {p.ready_for_fix} →
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {clSubmitTarget && (
        <CLSubmitDialog
          projectId={clSubmitTarget.project_id}
          projectName={clSubmitTarget.project_name}
          open
          onClose={() => setClSubmitTarget(null)}
          onSuccess={() => void refetch()}
        />
      )}
      {fixTarget && (
        <FixConfirmDialog
          projectId={fixTarget.project_id}
          projectName={fixTarget.project_name}
          open
          onClose={() => setFixTarget(null)}
          onSuccess={() => void refetch()}
        />
      )}
    </>
  );
}
