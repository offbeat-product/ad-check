import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLE_OPTIONS = [
  { value: "admin", label: "管理者", description: "全操作+メンバー管理+削除" },
  { value: "member", label: "メンバー", description: "編集+アップロード+チェック実行" },
  { value: "viewer", label: "閲覧者", description: "閲覧のみ" },
];

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onInvited: () => void;
}

export default function InviteMemberModal({ open, onOpenChange, projectId, projectName, onInvited }: InviteMemberModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!email.trim() || !user) return;
    setLoading(true);
    setStatusMessage(null);

    try {
      // Check if already a member
      const { data: existing } = await supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("email", email.trim())
        .maybeSingle();

      if (existing) {
        setStatusMessage("このユーザーは既にメンバーです。");
        setLoading(false);
        return;
      }

      // Search for user profile via RPC (avoids RLS restriction)
      const { data: profileRows } = await supabase
        .rpc("lookup_profile_by_email", { p_email: email.trim() });
      const profile = profileRows && profileRows.length > 0 ? profileRows[0] : null;

      // Insert member record (always pending — user must accept via notification)
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: profile?.id ?? null,
        email: email.trim(),
        role,
        invited_by: user.id,
        status: "pending",
      });

      if (error) {
        toast({ title: "エラー", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      // Send notification if user exists; otherwise show pending message
      if (profile) {
        await supabase.from("notifications").insert({
          user_id: profile.id,
          type: "invitation",
          title: `${projectName} プロジェクトに招待されました`,
          message: `${user.email} からの招待（${ROLE_OPTIONS.find(r => r.value === role)?.label}）`,
          data: { project_id: projectId, invited_by: user.id },
        });
        setStatusMessage("招待通知を送信しました。相手が承認するとプロジェクトに参加します。");
      } else {
        setStatusMessage("このユーザーはまだ登録されていません。登録後に招待通知が届きます。");
      }

      toast({ title: "招待を送信しました" });
      onInvited();
      setEmail("");
      setRole("member");
    } catch (e: any) {
      toast({ title: "エラー", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>メンバーを招待</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">メールアドレス</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@company.com"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">権限</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {statusMessage && (
            <p className="text-xs text-status-warning bg-status-warning/10 rounded-lg p-3">{statusMessage}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button size="sm" onClick={handleInvite} disabled={loading || !email.trim()}>
              {loading ? "送信中..." : "招待を送信"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
