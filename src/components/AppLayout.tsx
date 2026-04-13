import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import CreateProjectModal from "@/components/CreateProjectModal";
import GlobalSearch from "@/components/GlobalSearch";
import BatchCheckFloatingBar from "@/components/BatchCheckFloatingBar";
import NotificationBell from "@/components/NotificationBell";
import { Menu, X, Search } from "lucide-react";
import { openGlobalSearch } from "@/lib/global-search-events";
import { AdCheckLogoMark } from "@/components/AdCheckLogoMark";

export default function AppLayout() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; }
    catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar_collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <AppSidebar
          onCreateProject={() => setCreateOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-[280px] h-full animate-in slide-in-from-left duration-200">
            <AppSidebar onCreateProject={() => { setCreateOpen(true); setMobileOpen(false); }} collapsed={false} />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-[-40px] p-2 rounded-full bg-background/80 backdrop-blur border border-border"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-40 flex items-center gap-2 px-4 py-2 bg-card border-b border-border">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-muted">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-bold flex-1 flex items-center gap-2 min-w-0">
            <AdCheckLogoMark size="sm" />
            <span className="whitespace-nowrap bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent">
              Ad Check
            </span>
          </h1>
          <NotificationBell />
          <button
            type="button"
            onClick={() => openGlobalSearch()}
            className="p-2 rounded-lg hover:bg-muted"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <Outlet />
      </main>

      <GlobalSearch />
      <CreateProjectModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/project/${id}`)}
      />
      <BatchCheckFloatingBar />
    </div>
  );
}