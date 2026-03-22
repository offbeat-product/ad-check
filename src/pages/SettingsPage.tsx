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
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Trash2, UserPlus, Users, Mail, Shield, ShieldCheck, Eye, Copy, Check, MoreHorizontal, Link2, XCircle, Ban, RotateCcw, Sun, Moon, Monitor, KeyRound } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type Invitation = Tables<"invitations">;

const PASSWORD_MIN_LENGTH = 8;

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
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Notification settings
  const [notifyCheckComplete, setNotifyCheckComplete] = useState(true);
  const [notifyComment, setNotifyComment] = useState(true);


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

  // Confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<{
    type: "deactivate" | "reactivate" | "delete";
    profile: Profile;
  } | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setNotifyCheckComplete(profile.notify_check_complete);
      setNotifyComment(profile.notify_comment);
    }
  }, [profile]);


  const fetchMembers = async () => {
    setMembersLoading(true);
    const [profilesRes, invitationsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
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
    else toast({ title: "エラー", description: (error as { message?: string })?.message, variant: "destructive" });
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      toast({
        title: "エラー",
        description: `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください`,
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "エラー", description: "パスワードが一致しません", variant: "destructive" });
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "パスワードを変更しました" });
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSaveNotifications = async () => {
    const { error } = await updateProfile({
      notify_check_complete: notifyCheckComplete,
      notify_comment: notifyComment,
    }) ?? {};
    if (!error) toast({ title: "通知設定を保存しました" });
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
      // Also sync workspace_members role
      const profile = profiles.find(m => m.id === profileId);
      if (profile?.email) {
        await supabase.from("workspace_members").update({ role: newRole }).eq("email", profile.email);
      }
      toast({ title: "権限を変更しました" });
      fetchMembers();
    }
  };

  const handleDeactivate = async (profileId: string) => {
    const { error } = await supabase.from("profiles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", profileId);
    if (!error) {
      toast({ title: "メンバーを無効化しました" });
      fetchMembers();
    } else {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    }
    setConfirmAction(null);
  };

  const handleReactivate = async (profileId: string) => {
    const { error } = await supabase.from("profiles").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", profileId);
    if (!error) {
      toast({ title: "メンバーを再有効化しました" });
      fetchMembers();
    } else {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    }
    setConfirmAction(null);
  };

  const handleDeleteMember = async (profileId: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", profileId);
    if (!error) {
      toast({ title: "メンバーを削除しました" });
      fetchMembers();
    } else {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    }
    setConfirmAction(null);
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

  const activeCount = profiles.filter(p => p.is_active).length;
  const inactiveCount = profiles.filter(p => !p.is_active).length;
  const pendingCount = invitations.length;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-4 md:px-6 py-3 flex items-center bg-card">
        <div className="text-sm text-muted-foreground">設定</div>
      </header>

      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Tabs defaultValue="profile">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="profile">プロフィール</TabsTrigger>
            <TabsTrigger value="password" className="flex items-center gap-1">
              <KeyRound className="h-3.5 w-3.5" />パスワード
            </TabsTrigger>
            <TabsTrigger value="notifications">通知設定</TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />メンバー
              </TabsTrigger>
              <TabsTrigger value="appearance">表示</TabsTrigger>
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

          {/* Password Tab */}
          <TabsContent value="password">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-sm font-semibold">パスワード変更</h2>
              <p className="text-xs text-muted-foreground">
                新しいパスワードを{PASSWORD_MIN_LENGTH}文字以上で設定してください。
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">新しいパスワード</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="新しいパスワード"
                  autoComplete="new-password"
                  className="h-9 text-sm max-w-md"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">新しいパスワード（確認）</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="もう一度入力"
                  autoComplete="new-password"
                  className="h-9 text-sm max-w-md"
                />
              </div>
              <Button
                size="sm"
                onClick={handleChangePassword}
                disabled={passwordSaving || !newPassword || !confirmPassword}
              >
                {passwordSaving ? "変更中..." : "パスワードを変更"}
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
                    {activeCount}名{inactiveCount > 0 && ` (無効: ${inactiveCount})`}{pendingCount > 0 && ` (招待中: ${pendingCount})`}
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
                      const isInactive = !p.is_active;

                      return (
                        <div key={p.id} className={cn("flex items-center gap-3 px-4 py-3", isInactive && "opacity-50")}>
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
                          {isInactive && (
                            <Badge variant="outline" className="text-[9px] h-4 bg-destructive/10 text-destructive border-destructive/30 shrink-0">
                              <Ban className="h-2.5 w-2.5 mr-0.5" />無効
                            </Badge>
                          )}
                          {isAdmin && !isMe && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded hover:bg-muted transition-colors">
                                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {isInactive ? (
                                  <>
                                    <DropdownMenuItem onClick={() => setConfirmAction({ type: "reactivate", profile: p })}>
                                      <RotateCcw className="h-3.5 w-3.5 mr-2" />再有効化
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => setConfirmAction({ type: "delete", profile: p })}>
                                      <Trash2 className="h-3.5 w-3.5 mr-2" />削除
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <>
                                    {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                                      key !== p.role && (
                                        <DropdownMenuItem key={key} onClick={() => handleRoleChange(p.id, key)}>
                                          {cfg.label}に変更
                                        </DropdownMenuItem>
                                      )
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => setConfirmAction({ type: "deactivate", profile: p })}>
                                      <Ban className="h-3.5 w-3.5 mr-2" />無効化
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => setConfirmAction({ type: "delete", profile: p })}>
                                      <Trash2 className="h-3.5 w-3.5 mr-2" />削除
                                    </DropdownMenuItem>
                                  </>
                                )}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-sm font-semibold">表示設定</h2>
              <div>
                <p className="text-sm font-medium mb-3">テーマ</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "light", label: "ライト", icon: Sun },
                    { value: "dark", label: "ダーク", icon: Moon },
                    { value: "system", label: "システム", icon: Monitor },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                        theme === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/30 text-muted-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

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

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "deactivate" && "メンバーを無効化しますか？"}
              {confirmAction?.type === "reactivate" && "メンバーを再有効化しますか？"}
              {confirmAction?.type === "delete" && "メンバーを完全に削除しますか？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "deactivate" &&
                `${confirmAction.profile.email} を無効化すると、このユーザーはログインできなくなります。後から再有効化できます。`}
              {confirmAction?.type === "reactivate" &&
                `${confirmAction.profile.email} を再有効化すると、再びログインできるようになります。`}
              {confirmAction?.type === "delete" &&
                `${confirmAction.profile.email} を完全に削除しますか？この操作は取り消せません。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.type !== "reactivate" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "deactivate") handleDeactivate(confirmAction.profile.id);
                else if (confirmAction.type === "reactivate") handleReactivate(confirmAction.profile.id);
                else if (confirmAction.type === "delete") handleDeleteMember(confirmAction.profile.id);
              }}
            >
              {confirmAction?.type === "deactivate" && "無効化する"}
              {confirmAction?.type === "reactivate" && "再有効化する"}
              {confirmAction?.type === "delete" && "削除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
