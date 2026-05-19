import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { ProjectProcess } from "@/hooks/useProjectProcesses";

interface Props {
  processes: ProjectProcess[];
}

export default function ProcessTimeline({ processes }: Props) {
  const active = processes.filter((p) => p.is_active);
  if (active.length === 0) return null;

  return (
    <div className="glass-card p-4 overflow-x-auto">
      <div className="flex items-start gap-0 min-w-max">
        {active.map((p, i) => {
          const isCompleted = p.status === "completed";
          const isInProgress = p.status === "in_progress";
          const isLast = i === active.length - 1;

          return (
            <div key={p.id} className="flex items-start">
              <div className="flex flex-col items-center min-w-[72px]">
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2",
                    isCompleted && "bg-status-ok border-status-ok text-white",
                    isInProgress && "bg-primary border-primary text-primary-foreground animate-pulse",
                    !isCompleted && !isInProgress && "bg-muted border-border text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="h-3 w-3" /> : ""}
                </div>
                <span className={cn("text-[10px] mt-1 text-center leading-tight max-w-[68px]",
                  isCompleted ? "text-status-ok font-medium" :
                  isInProgress ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                  {p.process_label.length > 5 ? p.process_label.slice(0, 5) + "…" : p.process_label}
                </span>
                {p.deadline ? <span className="text-[9px] text-muted-foreground mt-0.5">
                    {new Date(p.deadline).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" })}
                  </span> : null}
              </div>
              {!isLast && (
                <div className={cn(
                  "w-6 h-0.5 mt-2.5 shrink-0",
                  isCompleted ? "bg-status-ok" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
