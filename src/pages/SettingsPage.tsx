import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useWorkspaceMembers, WORKSPACE_ROLE_CONFIG } from "@/hooks/useWorkspaceMembers";
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
import { Plus, Trash2, UserPlus, Users, Mail, Shield, ShieldCheck, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;
type Product = Tables<"products">;

const ROLE_ICON: Record<string, React.ElementType> = {
  admin: ShieldCheck,
  member: Shield,
  viewer: Eye,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { members, loading: membersLoading, isAdmin, inviteMember, updateMemberRole, removeMember } = useWorkspaceMembers();
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

  // Workspace invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

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

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const result = await inviteMember(inviteEmail.trim(), inviteRole);
    if (result.error) {
      toast({ title: "招待エラー", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "メンバーを招待しました", description: `${inviteEmail} を${WORKSPACE_ROLE_CONFIG[inviteRole]?.label}として招待しました` });
      setInviteEmail("");
    }
    setInviting(false);
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    const result = await updateMemberRole(memberId, role);
    if (result.error) {
      toast({ title: "エラー", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "権限を変更しました" });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const result = await removeMember(memberId);
    if (result.error) {
      toast({ title: "エラー", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "メンバーを削除しました" });
    }
  };

  if (profileLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  }

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
            <TabsTrigger value="organization">組織管理</TabsTrigger>
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">プロジェクト招待</p>
                  <p className="text-xs text-muted-foreground">プロジェクトに招待された時に通知</p>
                </div>
                <Switch checked={true} disabled />
              </div>
              <p className="text-[10px] text-muted-foreground">※ 招待通知はOFFにできません</p>
              <Button size="sm" onClick={handleSaveNotifications}>保存</Button>
            </div>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <div className="space-y-6">
              {/* Invite Form */}
              {isAdmin && (
                <div className="glass-card p-6 space-y-4">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />メンバーを招待
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    招待されたメンバーはワークスペース内の全データにアクセスできます。権限レベルで操作範囲を制御します。
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="メールアドレスを入力"
                      className="h-9 text-sm flex-1"
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    />
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger className="w-32 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(WORKSPACE_ROLE_CONFIG).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-1.5">
                              {cfg.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-9" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                      <Mail className="h-3.5 w-3.5 mr-1" />
                      {inviting ? "送信中..." : "招待"}
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-2">
                    {Object.entries(WORKSPACE_ROLE_CONFIG).map(([key, cfg]) => {
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
              )}

              {/* Members List */}
              <div className="glass-card p-6 space-y-4">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />ワークスペースメンバー
                  <Badge variant="outline" className="text-[10px] ml-1">{members.length}名</Badge>
                </h2>

                {membersLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">読み込み中...</p>
                ) : members.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">メンバーがいません</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">上のフォームからメンバーを招待してください</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {members.map((m) => {
                      const roleCfg = WORKSPACE_ROLE_CONFIG[m.role] || WORKSPACE_ROLE_CONFIG.viewer;
                      const Icon = ROLE_ICON[m.role] || Shield;
                      const isMe = m.user_id === user?.id;

                      return (
                        <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                            {(m.display_name || m.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">
                                {m.display_name || m.email.split("@")[0]}
                                {isMe && <span className="text-xs text-muted-foreground ml-1">(自分)</span>}
                              </p>
                              {m.status === "pending" && (
                                <Badge variant="outline" className="text-[9px] h-4 bg-status-warning/10 text-status-warning border-status-warning/30">
                                  招待中
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          </div>

                          {isAdmin && !isMe ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <Select value={m.role} onValueChange={(role) => handleRoleChange(m.id, role)}>
                                <SelectTrigger className="w-24 h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(WORKSPACE_ROLE_CONFIG).map(([key, cfg]) => (
                                    <SelectItem key={key} value={key} className="text-xs">{cfg.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>メンバーを削除</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      「{m.display_name || m.email}」をワークスペースから削除します。この操作は元に戻せません。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleRemoveMember(m.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      削除する
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          ) : (
                            <Badge className={cn("text-[10px] shrink-0", roleCfg.badgeClass)}>
                              <Icon className="h-3 w-3 mr-1" />
                              {roleCfg.label}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Organization Tab */}
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
        </Tabs>
      </div>
    </div>
  );
}
