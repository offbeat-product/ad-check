import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [role, setRole] = useState("editor");
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

      // Search for user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .eq("email", email.trim())
        .maybeSingle();

      // Insert member record
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

      // Send notification if user exists
      if (profile) {
        await supabase.from("notifications").insert({
          user_id: profile.id,
          type: "invitation",
          title: `${projectName} プロジェクトに招待されました`,
          message: `${user.email} からの招待`,
          data: { project_id: projectId, invited_by: user.id },
        });
      } else {
        setStatusMessage("このユーザーはまだCheckMateに登録されていません。登録後に自動的にプロジェクトに追加されます。");
      }

      toast({ title: "招待を送信しました" });
      onInvited();

      if (!statusMessage && profile) {
        setEmail("");
        setRole("editor");
        onOpenChange(false);
      }
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
                <SelectItem value="editor">
                  <div>
                    <p className="font-medium">編集者</p>
                    <p className="text-xs text-muted-foreground">チェック実行・コメント可能</p>
                  </div>
                </SelectItem>
                <SelectItem value="viewer">
                  <div>
                    <p className="font-medium">閲覧者</p>
                    <p className="text-xs text-muted-foreground">閲覧のみ</p>
                  </div>
                </SelectItem>
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
