import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleClick = (n: (typeof notifications)[0]) => {
    markAsRead(n.id);
    const data = n.data as Record<string, string> | null;
    if (data?.check_result_id) {
      navigate(`/check-result/${data.check_result_id}`);
    } else if (data?.project_id) {
      navigate(`/project/${data.project_id}`);
    }
    setOpen(false);
  };

  const handleAcceptInvite = async (n: (typeof notifications)[0], accept: boolean) => {
    const data = n.data as Record<string, string> | null;
    const { supabase } = await import("@/integrations/supabase/client");
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser) return;

    if (n.type === "workspace_invitation") {
      // Accept/decline workspace invitation
      await supabase
        .from("workspace_members")
        .update({ status: accept ? "accepted" : "declined", user_id: currentUser.id })
        .eq("email", currentUser.email!);
    } else if (n.type === "invitation" && data?.project_id) {
      // Accept/decline project invitation — match by project_id + current user's email
      await supabase
        .from("project_members")
        .update({ status: accept ? "accepted" : "declined" })
        .eq("project_id", data.project_id)
        .eq("user_id", currentUser.id);
    }

    markAsRead(n.id);
    if (accept && data?.project_id) {
      navigate(`/project/${data.project_id}`);
      setOpen(false);
    } else if (accept) {
      setOpen(false);
      window.location.reload();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted/50 transition-colors">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" side="bottom">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="text-sm font-semibold">通知</span>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-primary hover:underline"
            >
              全て既読
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">通知はありません</p>
            </div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <div
                key={n.id}
                className={cn(
                  "px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer",
                  !n.is_read && "bg-primary/5"
                )}
                onClick={() => n.type !== "invitation" && n.type !== "workspace_invitation" && handleClick(n)}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 w-2 h-2 rounded-full shrink-0",
                      n.is_read ? "bg-muted-foreground/30" : "bg-primary"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{n.title}</p>
                    {n.message && (
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                    )}
                    {(n.type === "invitation" || n.type === "workspace_invitation") && !n.is_read && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAcceptInvite(n, true); }}
                          className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                        >
                          承認
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAcceptInvite(n, false); }}
                          className="px-3 py-1 rounded-md border border-border text-xs font-medium hover:bg-muted"
                        >
                          辞退
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ja })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-center">
            <button
              onClick={() => { navigate("/notifications"); setOpen(false); }}
              className="text-xs text-primary hover:underline"
            >
              全ての通知を見る →
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
