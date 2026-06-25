import { FILE_STATUS_CONFIG, type ProjectFileStatus } from "@/lib/db-types";

interface ProjectStatusBadgesProps {
  counts: Record<ProjectFileStatus, number>;
  total: number;
}

const STATUS_ORDER: ProjectFileStatus[] = [
  "uploaded",
  "checking",
  "checked",
  "internal_revision",
  "client_review",
  "fixed",
];

const SHORT_LABEL: Record<ProjectFileStatus, string> = {
  uploaded: "チェック前",
  checking: "チェック中",
  checked: "チェック完了",
  internal_revision: "修正中",
  client_review: "CL確認",
  fixed: "FIX",
};

export function ProjectStatusBadges({ counts, total }: ProjectStatusBadgesProps) {
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">ファイルなし</span>;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STATUS_ORDER.map((status) => {
        const cnt = counts[status] ?? 0;
        if (cnt === 0) return null;
        const config = FILE_STATUS_CONFIG[status];
        if (!config) return null;
        return (
          <span
            key={status}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs whitespace-nowrap ${config.class}`}
          >
            {SHORT_LABEL[status]} {cnt}
          </span>
        );
      })}
    </div>
  );
}
