import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

export default function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleClick = async (n: (typeof notifications)[0]) => {
    markAsRead(n.id);
    const data = n.data as Record<string, string> | null;
    if (data?.check_result_id) {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: pf } = await supabase
        .from("project_files")
        .select("id, project_id")
        .eq("check_result_id", data.check_result_id)
        .limit(1)
        .maybeSingle();
      if (pf?.project_id) {
        navigate(`/project/${pf.project_id}/file/${pf.id}`);
      } else if (data.project_id) {
        navigate(`/project/${data.project_id}`);
      }
    } else if (data?.project_id) {
      navigate(`/project/${data.project_id}`);
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "mention": return "メンション";
      case "comment": return "コメント";
      case "check_complete": return "チェック完了";
      case "invitation": return "プロジェクト招待";
      case "workspace_invitation": return "ワークスペース招待";
      default: return "通知";
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h1 className="text-xl font-bold">通知一覧</h1>
          {unreadCount > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead} className="text-xs">
            <CheckCheck className="h-3 w-3 mr-1" />
            全て既読にする
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">通知はありません</p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-3 p-4 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer",
                !n.is_read && "bg-primary/5 border-primary/20"
              )}
              onClick={() => handleClick(n)}
            >
              <span
                className={cn(
                  "mt-1.5 w-2 h-2 rounded-full shrink-0",
                  n.is_read ? "bg-muted-foreground/30" : "bg-primary"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {typeLabel(n.type)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ja })}
                  </span>
                </div>
                <p className="text-sm font-medium mt-1">{n.title}</p>
                {n.message && (
                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line line-clamp-3">{n.message}</p>
                )}
              </div>
              {!n.is_read && (
                <button
                  onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="既読にする"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
