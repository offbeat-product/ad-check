import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { ArrowRightLeft, Calendar, Edit3, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_STATUS_CONFIG } from "@/lib/process-config";
import { Button } from "@/components/ui/button";

/** TanStack Query: prefix で一括 invalidate 可能 */
export const PROJECT_AUDIT_LOG_QUERY_KEY = "project-audit-log" as const;

export interface ProjectAuditLogRow {
  id: string;
  project_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface ProjectAuditLogProps {
  projectId: string;
}

function getFieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    status: "ステータス",
    deadline: "納品日",
    name: "案件名",
    ob_pm: "担当 PM",
    ob_am: "担当 AM",
    ob_qm: "担当 QM",
    overall_deadline: "全体納期",
    description: "説明",
  };
  return labels[fieldName] || fieldName;
}

function formatStatusLabel(code: string | null): string {
  if (!code) return "(未設定)";
  const s = code === "active" ? "in_progress" : code;
  return PROJECT_STATUS_CONFIG[s]?.label || code;
}

function formatValue(value: string | null, fieldName: string): string {
  if (!value) return "(未設定)";

  if (fieldName === "status") {
    return formatStatusLabel(value);
  }

  if (fieldName === "deadline" || fieldName === "overall_deadline") {
    try {
      const d = value.length <= 10 ? parseISO(`${value}T00:00:00`) : parseISO(value);
      if (Number.isNaN(d.getTime())) return value;
      return format(d, "yyyy/MM/dd");
    } catch {
      return value;
    }
  }

  if (fieldName === "description" && value.length > 50) {
    return `${value.slice(0, 50)}...`;
  }

  return value;
}

function getActionIcon(action: string, fieldName: string) {
  if (action === "status_changed" || fieldName === "status") {
    return <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />;
  }
  if (
    action === "deadline_changed" ||
    action === "overall_deadline_changed" ||
    fieldName === "deadline" ||
    fieldName === "overall_deadline"
  ) {
    return <Calendar className="h-4 w-4 shrink-0" aria-hidden />;
  }
  if (fieldName.startsWith("ob_")) {
    return <User className="h-4 w-4 shrink-0" aria-hidden />;
  }
  return <Edit3 className="h-4 w-4 shrink-0" aria-hidden />;
}

function AuditLogRow({ log }: { log: ProjectAuditLogRow }) {
  const meta = log.user_email?.trim() || "システム";
  const created = format(new Date(log.created_at), "yyyy/MM/dd HH:mm", { locale: ja });

  return (
    <div className="flex items-start gap-3 p-3 border-b border-border last:border-b-0">
      <div className="text-muted-foreground pt-0.5">{getActionIcon(log.action, log.field_name)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">
          <span className="font-medium">{getFieldLabel(log.field_name)}</span>
          <span className="text-muted-foreground"> を </span>
          <span className="line-through text-muted-foreground">{formatValue(log.old_value, log.field_name)}</span>
          <span className="text-muted-foreground"> → </span>
          <span className="font-medium">{formatValue(log.new_value, log.field_name)}</span>
          <span className="text-muted-foreground"> に変更</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {meta} ・ {created}
        </div>
      </div>
    </div>
  );
}

export function ProjectAuditLog({ projectId }: ProjectAuditLogProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [PROJECT_AUDIT_LOG_QUERY_KEY, projectId],
    queryFn: async () => {
      const { data: rows, error: qErr } = await supabase
        .from("project_audit_log")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (qErr) throw qErr;
      return (rows ?? []) as ProjectAuditLogRow[];
    },
    enabled: Boolean(projectId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
        読み込み中...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center text-sm text-destructive py-8">
        {error instanceof Error ? error.message : "変更履歴の取得に失敗しました"}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <div className="text-center text-muted-foreground py-8">変更履歴がありません</div>;
  }

  return (
    <div className="space-y-3">
      <div className="glass-card overflow-hidden">
        {data.map((log) => (
          <AuditLogRow key={log.id} log={log} />
        ))}
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="text-xs" disabled title="ページネーションは今後対応予定です">
          もっと見る
        </Button>
        {data.length >= 100 && (
          <p className="text-[10px] text-muted-foreground text-center px-4">最新100件まで表示しています</p>
        )}
      </div>
    </div>
  );
}
