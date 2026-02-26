import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Trash2, UserPlus, Users, Mail, Shield, ShieldCheck, Eye, Copy, Check, MoreHorizontal, Link2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;
type Product = Tables<"products">;
type Profile = Tables<"profiles">;
type Invitation = Tables<"invitations">;

const ROLE_CONFIG: Record<string, { label: string; description: string; badgeClass: string }> = {
  admin: { label: "管理者", description: "全操作+メンバー管理+削除", badgeClass: "bg-destructive/10 text-destructive" },
  member: { label: "メンバー", description: "編集+アップロード+チェック実行", badgeClass: "bg-primary/10 text-primary" },
  viewer: { label: "閲覧者", description: "閲覧のみ", badgeClass: "bg-muted text-muted-foreground" },
};

const ROLE_ICON: Record<string, React.ElementType> = {
  admin: ShieldCheck,
  member: Shield,
  viewer: Eye,
};

export default function SettingsPage() {
  const { user, isAdmin, canEdit } = useAuth();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { toast } = useToast();

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  // Notification settings
  const [notifyCheckComplete, setNotifyCheckComplete] = useState(true);
  const [notifyComment, setNotifyComment] = useState(true);

  // Org management
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orgTab, setOrgTab] = useState("clients");
  const [newClientName, setNewClientName] = useState("");

  // Members
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setNotifyCheckComplete(profile.notify_check_complete);
      setNotifyComment(profile.notify_comment);
    }
  }, [profile]);

  useEffect(() => {
    const fetchOrg = async () => {
      const [cl, pr] = await Promise.all([
        supabase.from("clients").select("*").order("created_at"),
        supabase.from("products").select("*").order("created_at"),
      ]);
      setClients(cl.data ?? []);
      setProducts(pr.data ?? []);
    };
    fetchOrg();
  }, []);

  const fetchMembers = async () => {
    setMembersLoading(true);
    const [profilesRes, invitationsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("is_active", true).order("created_at"),
      supabase.from("invitations").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    setProfiles(profilesRes.data ?? []);
    setInvitations(invitationsRes.data ?? []);
    setMembersLoading(false);
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await updateProfile({ display_name: displayName.trim() || null }) ?? {};
    if (!error) toast({ title: "プロフィールを保存しました" });
    else toast({ title: "エラー", description: (error as any)?.message, variant: "destructive" });
    setSaving(false);
  };

  const handleSaveNotifications = async () => {
    const { error } = await updateProfile({
      notify_check_complete: notifyCheckComplete,
      notify_comment: notifyComment,
    }) ?? {};
    if (!error) toast({ title: "通知設定を保存しました" });
  };

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;
    const { error } = await supabase.from("clients").insert({ name: newClientName.trim() });
    if (error) { toast({ title: "エラー", description: error.message, variant: "destructive" }); return; }
    toast({ title: "クライアントを追加しました" });
    setNewClientName("");
    const { data } = await supabase.from("clients").select("*").order("created_at");
    setClients(data ?? []);
  };

  const handleDeleteClient = async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { toast({ title: "エラー", description: error.message, variant: "destructive" }); return; }
    setClients((prev) => prev.filter((c) => c.id !== id));
    toast({ title: "クライアントを削除しました" });
  };

  // Invitation
  const handleCreateInvitation = async () => {
    if (!inviteEmail.trim() || !user) return;
    setInviting(true);

    try {
      // Check if already a member
      const existingProfile = profiles.find(p => p.email === inviteEmail.trim());
      if (existingProfile) {
        toast({ title: "エラー", description: "このメールアドレスは既に登録されています", variant: "destructive" });
        setInviting(false);
        return;
      }

      // Check if already invited
      const existingInvite = invitations.find(i => i.email === inviteEmail.trim());
      if (existingInvite) {
        toast({ title: "エラー", description: "このメールアドレスは既に招待済みです", variant: "destructive" });
        setInviting(false);
        return;
      }

      // Create invitation record
      const { data: invitation, error } = await supabase
        .from("invitations")
        .insert({
          email: inviteEmail.trim(),
          role: inviteRole,
          display_name: inviteDisplayName.trim() || null,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Also create workspace member record
      await supabase.from("workspace_members").insert({
        email: inviteEmail.trim(),
        role: inviteRole,
        status: "pending",
        invited_by: user.id,
      });

      // Try to create auth account (sends confirmation email)
      await supabase.auth.signUp({
        email: inviteEmail.trim(),
        password: crypto.randomUUID().slice(0, 16),
        options: {
          data: { display_name: inviteDisplayName.trim() || undefined, role: inviteRole },
          emailRedirectTo: `${window.location.origin}/accept-invite`,
        },
      });

      // Generate invite link
      const link = `${window.location.origin}/accept-invite?token=${invitation.token}`;
      setGeneratedLink(link);
      await fetchMembers();
    } catch (err: any) {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    }
    setInviting(false);
  };

  const handleCopyLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "招待リンクをコピーしました", description: "相手に共有してください。" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancelInvitation = async (id: string) => {
    const { error } = await supabase.from("invitations").update({ status: "cancelled" }).eq("id", id);
    if (!error) {
      toast({ title: "招待をキャンセルしました" });
      fetchMembers();
    }
  };

  const handleCopyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/accept-invite?token=${token}`;
    await navigator.clipboard.writeText(link);
    toast({ title: "招待リンクをコピーしました" });
  };

  const handleRoleChange = async (profileId: string, newRole: string) => {
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "権限を変更しました" });
      fetchMembers();
    }
  };

  const handleDeactivate = async (profileId: string) => {
    const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", profileId);
    if (!error) {
      toast({ title: "メンバーを無効化しました" });
      fetchMembers();
    }
  };

  const resetInviteModal = () => {
    setInviteEmail("");
    setInviteDisplayName("");
    setInviteRole("member");
    setGeneratedLink(null);
    setCopied(false);
  };

  if (profileLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  }

  const activeCount = profiles.length;
  const pendingCount = invitations.length;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center bg-card">
        <div className="text-sm text-muted-foreground">設定</div>
      </header>

      <div className="p-6 max-w-3xl mx-auto">
        <Tabs defaultValue="profile">
          <TabsList className="mb-6">
            <TabsTrigger value="profile">プロフィール</TabsTrigger>
            <TabsTrigger value="notifications">通知設定</TabsTrigger>
            <TabsTrigger value="members" className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />メンバー
            </TabsTrigger>
            {isAdmin && <TabsTrigger value="organization">組織管理</TabsTrigger>}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-sm font-semibold">プロフィール設定</h2>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
                  {(displayName || profile?.email || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{displayName || profile?.email?.split("@")[0]}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">表示名</label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="表示名を入力" className="h-9 text-sm max-w-md" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">メールアドレス</label>
                <p className="text-sm text-muted-foreground">{profile?.email} <span className="text-xs">(変更不可)</span></p>
              </div>
              <Button size="sm" onClick={handleSaveProfile} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </TabsContent>

          {/* Notification Tab */}
          <TabsContent value="notifications">
            <div className="glass-card p-6 space-y-5">
              <h2 className="text-sm font-semibold">通知設定</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">AIチェック完了</p>
                  <p className="text-xs text-muted-foreground">チェック結果が出た時に通知</p>
                </div>
                <Switch checked={notifyCheckComplete} onCheckedChange={setNotifyCheckComplete} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">コメント・メンション</p>
                  <p className="text-xs text-muted-foreground">コメントやメンションがあった時に通知</p>
                </div>
                <Switch checked={notifyComment} onCheckedChange={setNotifyComment} />
              </div>
              <Button size="sm" onClick={handleSaveNotifications}>保存</Button>
            </div>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">ワークスペースメンバー</h2>
                  <Badge variant="outline" className="text-[10px]">
                    {activeCount}名{pendingCount > 0 && ` (招待中: ${pendingCount})`}
                  </Badge>
                </div>
                {isAdmin && (
                  <Button size="sm" className="h-8 text-xs" onClick={() => { resetInviteModal(); setInviteOpen(true); }}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" />メンバーを招待
                  </Button>
                )}
              </div>

              {/* Active Members */}
              <div className="glass-card divide-y divide-border overflow-hidden">
                {membersLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">読み込み中...</p>
                ) : (
                  <>
                    {profiles.map((p) => {
                      const roleCfg = ROLE_CONFIG[p.role] || ROLE_CONFIG.viewer;
                      const Icon = ROLE_ICON[p.role] || Eye;
                      const isMe = p.id === user?.id;

                      return (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                            {(p.display_name || p.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {p.display_name || p.email.split("@")[0]}
                              {isMe && <span className="text-xs text-muted-foreground ml-1">(自分)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                          </div>
                          <Badge className={cn("text-[10px] shrink-0", roleCfg.badgeClass)}>
                            <Icon className="h-3 w-3 mr-1" />{roleCfg.label}
                          </Badge>
                          {isAdmin && !isMe && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded hover:bg-muted transition-colors">
                                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                                  key !== p.role && (
                                    <DropdownMenuItem key={key} onClick={() => handleRoleChange(p.id, key)}>
                                      {cfg.label}に変更
                                    </DropdownMenuItem>
                                  )
                                ))}
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDeactivate(p.id)}>
                                  無効化
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })}

                    {/* Pending Invitations */}
                    {invitations.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-3 px-4 py-3 bg-muted/20">
                        <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {ROLE_CONFIG[inv.role]?.label || inv.role} · 有効期限: {new Date(inv.expires_at).toLocaleDateString("ja-JP")}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[9px] h-4 bg-amber-500/10 text-amber-600 border-amber-500/30 shrink-0">
                          招待中
                        </Badge>
                        {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded hover:bg-muted transition-colors">
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleCopyInviteLink(inv.token)}>
                                <Link2 className="h-3.5 w-3.5 mr-2" />リンクをコピー
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleCancelInvitation(inv.id)}>
                                <XCircle className="h-3.5 w-3.5 mr-2" />招待キャンセル
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))}

                    {profiles.length === 0 && invitations.length === 0 && (
                      <div className="text-center py-8">
                        <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">メンバーがいません</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Role explanation */}
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
                  const Icon = ROLE_ICON[key] || Shield;
                  return (
                    <div key={key} className="p-3 rounded-lg border border-border bg-muted/20 text-center">
                      <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xs font-medium">{cfg.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{cfg.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* Organization Tab */}
          {isAdmin && (
            <TabsContent value="organization">
              <div className="glass-card p-6 space-y-5">
                <h2 className="text-sm font-semibold">組織管理</h2>
                <Tabs value={orgTab} onValueChange={setOrgTab}>
                  <TabsList>
                    <TabsTrigger value="clients">クライアント</TabsTrigger>
                    <TabsTrigger value="products">商材</TabsTrigger>
                  </TabsList>
                  <TabsContent value="clients" className="mt-4 space-y-3">
                    <div className="flex gap-2">
                      <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="クライアント名" className="h-8 text-sm flex-1" onKeyDown={(e) => e.key === "Enter" && handleAddClient()} />
                      <Button size="sm" className="h-8 text-xs" onClick={handleAddClient}>
                        <Plus className="h-3 w-3 mr-1" />追加
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {clients.map((c) => {
                        const productCount = products.filter((p) => p.client_id === c.id).length;
                        return (
                          <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">商材: {productCount}</p>
                            </div>
                            <button onClick={() => handleDeleteClient(c.id)} className="p-1 rounded hover:bg-muted transition-colors">
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </div>
                        );
                      })}
                      {clients.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">クライアントがありません</p>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="products" className="mt-4 space-y-3">
                    <div className="space-y-1">
                      {products.map((p) => {
                        const clientName = clients.find((c) => c.id === p.client_id)?.name || "";
                        return (
                          <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color ? `hsl(${p.color})` : "hsl(var(--primary))" }} />
                              <div>
                                <p className="text-sm font-medium">{p.name}</p>
                                <p className="text-xs text-muted-foreground">{clientName} · {p.code}</p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px]">{p.label}</Badge>
                          </div>
                        );
                      })}
                      {products.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">商材がありません</p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Invite Modal */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) resetInviteModal(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{generatedLink ? "✅ 招待を作成しました" : "メンバーを招待"}</DialogTitle>
          </DialogHeader>

          {generatedLink ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">招待リンク:</p>
              <div className="flex items-center gap-2">
                <Input value={generatedLink} readOnly className="h-9 text-xs bg-muted" />
                <Button size="sm" variant="outline" className="shrink-0 h-9" onClick={() => handleCopyLink(generatedLink)}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                このリンクを招待したい方にSlackやLINE等で共有してください。<br />
                有効期限: 7日間
              </p>
              <Button variant="outline" className="w-full" onClick={() => { setInviteOpen(false); resetInviteModal(); }}>
                閉じる
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">メールアドレス *</label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="example@company.com"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">表示名</label>
                <Input
                  value={inviteDisplayName}
                  onChange={(e) => setInviteDisplayName(e.target.value)}
                  placeholder="例: 山田太郎"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ロール</label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <p className="font-medium">{cfg.label}</p>
                          <p className="text-xs text-muted-foreground">{cfg.description}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>キャンセル</Button>
                <Button size="sm" onClick={handleCreateInvitation} disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? "作成中..." : "招待を作成"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
