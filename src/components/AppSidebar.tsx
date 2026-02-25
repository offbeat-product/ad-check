import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PRODUCTS, type ProductCode } from "@/lib/types";
import {
  Home, Zap, FolderOpen, Settings, LogOut, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  onProductSelect?: (code: ProductCode) => void;
}

export default function AppSidebar({ onProductSelect }: AppSidebarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projectOpen, setProjectOpen] = useState(true);
  const [clientOpen, setClientOpen] = useState(true);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const navItems = [
    { icon: Home, label: "ホーム", path: "/dashboard" },
    { icon: Zap, label: "クイックチェック", path: "/check" },
  ];

  const productColorMap: Record<string, string> = {
    "product-ltr": "hsl(193, 100%, 50%)",
    "product-cta": "hsl(264, 100%, 58%)",
    "product-tmd": "hsl(166, 100%, 39%)",
  };

  return (
    <aside className="w-[260px] min-w-[260px] h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <span>♟</span>
          <span className="gradient-text">CheckMate AI</span>
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">v2.0 — Ad Creative Quality Check</p>
      </div>

      {/* User */}
      <div className="px-5 py-3 border-b border-sidebar-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
          {user?.email?.charAt(0).toUpperCase() || "U"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.email || "User"}</p>
          <p className="text-[11px] text-muted-foreground">Off Beat</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
                  : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}

        {/* Projects tree */}
        <button
          onClick={() => setProjectOpen(!projectOpen)}
          className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
        >
          <FolderOpen className="h-4 w-4" />
          プロジェクト
          {projectOpen ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
        </button>

        {projectOpen && (
          <div className="ml-4">
            <button
              onClick={() => setClientOpen(!clientOpen)}
              className="w-full flex items-center gap-2 px-5 py-2 text-sm text-muted-foreground hover:bg-muted/50"
            >
              {clientOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span className="font-medium">レバレジーズ</span>
            </button>

            {clientOpen && (
              <div className="ml-4">
                {PRODUCTS.map((p) => {
                  const color = productColorMap[p.color] || "hsl(193, 100%, 50%)";
                  return (
                    <button
                      key={p.code}
                      onClick={() => {
                        onProductSelect?.(p.code);
                        navigate("/check");
                      }}
                      className="w-full flex items-center gap-2 px-5 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => {}}
          className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
        >
          <Settings className="h-4 w-4" />
          設定
        </button>
      </nav>

      {/* Sign out */}
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors"
        >
          <LogOut className="h-4 w-4" />
          ログアウト
        </button>
      </div>
    </aside>
  );
}
