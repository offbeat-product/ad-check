import { Badge } from "@/components/ui/badge";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import type { ProjectFile } from "@/lib/db-types";
import { Loader2 } from "lucide-react";

interface Props {
  processKey: string;
  files: ProjectFile[];
  /** Briefly true after auto-queue drains all pending AI checks */
  showAllComplete: boolean;
}

export function ProcessAiAutoCheckBadge({ processKey, files, showAllComplete }: Props) {
  const roots = files.filter((f) => f.process_type === processKey && !f.parent_file_id);
  const aiRoots = roots.filter((f) => Boolean(f.file_data) && AI_CHECK_CONFIG[processKey]?.enabled);
  if (aiRoots.length === 0) return null;

  const done = aiRoots.filter((f) => f.status === "checked" || f.status === "fixed").length;
  const pending = aiRoots.filter((f) => f.status === "uploaded" || f.status === "checking").length;

  if (pending > 0) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-normal gap-1 border-primary/30 bg-primary/5 text-primary shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden />
        AIチェック中… ({done}/{aiRoots.length})
      </Badge>
    );
  }

  if (showAllComplete && done === aiRoots.length) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-normal shrink-0 border-status-ok/40 bg-status-ok/10 text-status-ok"
        onClick={(e) => e.stopPropagation()}
      >
        全件チェック完了
      </Badge>
    );
  }

  return null;
}
