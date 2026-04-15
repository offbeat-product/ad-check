import { ClipboardList } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { ProjectStatusView } from "@/components/projects/ProjectStatusView";

export default function AllProjectsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 shrink-0 border-b border-border px-4 md:px-6 py-3 flex items-center justify-between bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <h1 className="text-sm font-semibold truncate">案件一覧</h1>
        </div>
        <NotificationBell />
      </header>

      <div className="flex-1 flex flex-col min-h-0 w-full max-w-7xl mx-auto px-4 md:px-6 py-6">
        <ProjectStatusView />
      </div>
    </div>
  );
}
