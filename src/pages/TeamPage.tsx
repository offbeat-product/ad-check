import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, Copy, RefreshCw, Ban, Check, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

const ROLE_OPTIONS = [
  { value: "admin", label: "管理者", color: "text-red-600 bg-red-100 dark:bg-red-900/30" },
  { value: "member", label: "メンバー", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  { value: "viewer", label: "閲覧者", color: "text-muted-foreground bg-muted" },
];

interface Member {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export default function TeamPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Invite form
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invRole, setInvRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: inv }] = await Promise.all([
      supabase.from("profiles").select("id, email, display_name, role, is_active, last_login_at, created_at").order("created_at"),
      supabase.from("invitations").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    setMembers((m as Member[]) || []);
    setInvitations((inv as Invitation[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInvite = async () => {
    if (!invEmail.trim() || !user) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.from("invitations").insert({
        email: invEmail.trim(),
        role: invRole,
        display_name: invName.trim() || null,
        invited_by: user.id,
      }).select().single();

      if (error) throw error;

      const link = `${window.location.origin}/accept-invite?token=${data.token}`;
      setCopiedLink(link);
      await navigator.clipboard.writeText(link);
      toast({ title: "招待リンクをコピーしました", description: "相手に共有してください。" });
      setInvEmail("");
      setInvName("");
      setInvRole("member");
      fetchData();
    } catch (err: any) {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (memberId === user?.id) {
      toast({ title: "エラー", description: "自分自身のロールは変更できません。", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", memberId);
    if (error) toast({ title: "エラー", description: error.message, variant: "destructive" });
    else { toast({ title: "ロールを変更しました" }); fetchData(); }
  };

  const handleToggleActive = async (memberId: string, currentActive: boolean) => {
    if (memberId === user?.id) return;
    const { error } = await supabase.from("profiles").update({ is_active: !currentActive }).eq("id", memberId);
    if (error) toast({ title: "エラー", description: error.message, variant: "destructive" });
    else { toast({ title: currentActive ? "無効化しました" : "有効化しました" }); fetchData(); }
  };

  const handleCancelInvite = async (invId: string) => {
    const { error } = await supabase.from("invitations").update({ status: "cancelled" }).eq("id", invId);
    if (error) toast({ title: "エラー", description: error.message, variant: "destructive" });
    else { toast({ title: "招待をキャンセルしました" }); fetchData(); }
  };

  const handleResendInvite = async (inv: Invitation) => {
    // Cancel old and create new
    await supabase.from("invitations").update({ status: "cancelled" }).eq("id", inv.id);
    const { data, error } = await supabase.from("invitations").insert({
      email: inv.email,
      role: inv.role,
      display_name: inv.display_name,
      invited_by: user!.id,
    }).select().single();

    if (error) { toast({ title: "エラー", description: error.message, variant: "destructive" }); return; }

    const link = `${window.location.origin}/accept-invite?token=${data.token}`;
    await navigator.clipboard.writeText(link);
    toast({ title: "新しい招待リンクをコピーしました", description: "相手に共有してください。" });
    fetchData();
  };

  const activeCount = members.filter(m => m.is_active).length;
  const pendingCount = invitations.length;
  const roleConfig = (r: string) => ROLE_OPTIONS.find(o => o.value === r) || ROLE_OPTIONS[2];

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>この操作には管理者権限が必要です。</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> チームメンバー
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {members.length}名（アクティブ: {activeCount} / 招待中: {pendingCount}）
          </p>
        </div>
        <Button onClick={() => { setInviteOpen(true); setCopiedLink(null); }} className="gap-2">
          <UserPlus className="h-4 w-4" /> メンバーを招待
        </Button>
      </div>

      {/* Members Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>表示名</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>最終ログイン</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id} className={!m.is_active ? "opacity-50" : ""}>
                <TableCell className="font-medium">{m.display_name || "-"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                <TableCell>
                  {m.id === user?.id ? (
                    <Badge className={roleConfig(m.role).color}>{roleConfig(m.role).label}</Badge>
                  ) : (
                    <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}>
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={m.is_active ? "default" : "secondary"}>
                    {m.is_active ? "アクティブ" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.last_login_at ? formatDistanceToNow(new Date(m.last_login_at), { addSuffix: true, locale: ja }) : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {m.id !== user?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(m.id, m.is_active)}
                      className="text-xs"
                    >
                      {m.is_active ? <Ban className="h-3.5 w-3.5 mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                      {m.is_active ? "無効化" : "有効化"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">招待中</h2>
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>メールアドレス</TableHead>
                  <TableHead>ロール</TableHead>
                  <TableHead>有効期限</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      <Badge className={roleConfig(inv.role).color}>{roleConfig(inv.role).label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true, locale: ja })}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleResendInvite(inv)}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> 再送
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => handleCancelInvite(inv.id)}>
                        キャンセル
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>メンバーを招待</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>メールアドレス <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="example@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>表示名（任意）</Label>
              <Input
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                placeholder="例: 山田太郎"
              />
            </div>
            <div className="space-y-2">
              <Label>ロール</Label>
              <Select value={invRole} onValueChange={setInvRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {copiedLink && (
              <div className="bg-muted rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-green-600">✅ 招待リンクを生成しました</p>
                <div className="flex items-center gap-2">
                  <Input value={copiedLink} readOnly className="text-xs h-8" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(copiedLink);
                      toast({ title: "コピーしました" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  このリンクをSlack・メール等で相手に共有してください。
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)}>閉じる</Button>
              <Button onClick={handleInvite} disabled={inviting || !invEmail.trim()}>
                {inviting ? "送信中..." : "招待を送信"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
