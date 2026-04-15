import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStatusSummary, type ProjectStatusSummary } from "@/hooks/useProjectStatusSummary";
import { ProjectStatusBadges } from "@/components/projects/ProjectStatusBadges";
import { CLSubmitDialog } from "@/components/projects/CLSubmitDialog";
import { FixConfirmDialog } from "@/components/projects/FixConfirmDialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export function ProjectStatusView() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useProjectStatusSummary();
  const [clSubmitTarget, setClSubmitTarget] = useState<ProjectStatusSummary | null>(null);
  const [fixTarget, setFixTarget] = useState<ProjectStatusSummary | null>(null);

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

  return (
    <>
      <div className="flex items-center gap-4 mb-4 px-1 text-sm flex-wrap">
        <span className="text-muted-foreground">全{data.length}件</span>
        <span className="text-muted-foreground">·</span>
        <span>
          CL提出可能{" "}
          <strong className="text-foreground">{data.filter((d) => d.ready_for_cl_submit > 0).length}</strong> 件
        </span>
        <span>
          FIX確定可能{" "}
          <strong className="text-foreground">{data.filter((d) => d.ready_for_fix > 0).length}</strong> 件
        </span>
      </div>

      <div className="border rounded-lg overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">案件名</TableHead>
              <TableHead className="min-w-[120px]">クライアント</TableHead>
              <TableHead className="min-w-[120px]">商材</TableHead>
              <TableHead className="min-w-[100px]">納品日</TableHead>
              <TableHead className="min-w-[280px]">ステータス</TableHead>
              <TableHead className="min-w-[200px] text-right">アクション</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.project_id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left hover:underline font-medium"
                    onClick={() => navigate(`/project/${p.project_id}`)}
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
                  <div className="flex items-center gap-2 justify-end flex-wrap">
                    {p.ready_for_cl_submit > 0 && (
                      <Button size="sm" variant="secondary" type="button" onClick={() => setClSubmitTarget(p)}>
                        CL提出 {p.ready_for_cl_submit}
                      </Button>
                    )}
                    {p.ready_for_fix > 0 && (
                      <Button size="sm" type="button" onClick={() => setFixTarget(p)}>
                        FIX確定 {p.ready_for_fix}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
