import { FILE_STATUS_CONFIG, type ProjectFileStatus } from "@/lib/db-types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
          <Tooltip key={status}>
            <TooltipTrigger asChild>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${config.class}`}>
                {cnt}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {config.label}: {cnt}件
            </TooltipContent>
          </Tooltip>
        );
      })}
      <span className="text-xs text-muted-foreground ml-1">/ 計{total}件</span>
    </div>
  );
}
