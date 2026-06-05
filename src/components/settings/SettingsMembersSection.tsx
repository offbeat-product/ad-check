import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Ban, Copy, MoreHorizontal, Pencil, UserPlus, Mail, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCreatorRegisterUrl } from "@/lib/creator-share";
import { CreatorInviteLinkPanel } from "@/components/creator/CreatorInviteLinkPanel";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type Invitation = Tables<"invitations">;
type Creator = Tables<"creators">;

const STAFF_ROLES = ["admin", "director"] as const;

function isDirectorRole(role: string | null | undefined): boolean {
  return role === "director" || role === "member";
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ja-JP");
  } catch {
    return "—";
  }
}

export function SettingsMembersSection() {
  const { user, isAdmin, isStaff } = useAuth();
  const { toast } = useToast();

  const [staffTab, setStaffTab] = useState<"admin" | "director" | "creator">("admin");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [collabCountByCreator, setCollabCountByCreator] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteStaffOpen, setInviteStaffOpen] = useState(false);
  const [inviteStaffRole, setInviteStaffRole] = useState<"admin" | "director">("admin");
  const [inviteStaffEmail, setInviteStaffEmail] = useState("");
  const [inviteStaffDisplayName, setInviteStaffDisplayName] = useState("");
  const [inviteStaffBusy, setInviteStaffBusy] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  const [editStaffOpen, setEditStaffOpen] = useState(false);
  const [editStaffProfile, setEditStaffProfile] = useState<Profile | null>(null);
  const [editStaffRole, setEditStaffRole] = useState<string>("director");
  const [editStaffActive, setEditStaffActive] = useState(true);
  const [editStaffSaving, setEditStaffSaving] = useState(false);

  const [creatorDialogOpen, setCreatorDialogOpen] = useState(false);
  const [creatorMode, setCreatorMode] = useState<"add" | "edit">("add");
  const [creatorEditingId, setCreatorEditingId] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [creatorSaving, setCreatorSaving] = useState(false);
  const [creatorEmailError, setCreatorEmailError] = useState<string | null>(null);
  const [creatorInviteLink, setCreatorInviteLink] = useState<string | null>(null);
  const [creatorInviteToken, setCreatorInviteToken] = useState<string | null>(null);

  const [confirmStaffDeactivate, setConfirmStaffDeactivate] = useState<Profile | null>(null);
  const [confirmCreatorDeactivate, setConfirmCreatorDeactivate] = useState<Creator | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [profilesRes, invitationsRes, creatorsRes, collabRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("invitations").select("*").eq("status", "pending").order("created_at", { ascending: false }),
        supabase.from("creators").select("*").order("name"),
        supabase.from("project_collaborators").select("creator_id").eq("is_active", true),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (invitationsRes.error) throw invitationsRes.error;

      setProfiles(profilesRes.data ?? []);
      setInvitations(invitationsRes.data ?? []);

      if (creatorsRes.error) {
        console.warn("[SettingsMembers] creators fetch:", creatorsRes.error.message);
        setCreators([]);
      } else {
        setCreators(creatorsRes.data ?? []);
      }

      const counts: Record<string, number> = {};
      if (!collabRes.error && collabRes.data) {
        for (const row of collabRes.data) {
          const id = row.creator_id;
          counts[id] = (counts[id] || 0) + 1;
        }
      }
      setCollabCountByCreator(counts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "不明なエラー";
      setLoadError(msg);
      toast({ title: "データの取得に失敗しました", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const adminProfiles = useMemo(
    () => profiles.filter((p) => p.role === "admin" && p.is_active),
    [profiles]
  );
  const directorProfiles = useMemo(
    () => profiles.filter((p) => isDirectorRole(p.role) && p.is_active),
    [profiles]
  );
  const activeCreators = useMemo(() => creators.filter((c) => c.is_active), [creators]);

  const pendingInvitesFor = useCallback(
    (tabKey: "admin" | "director") =>
      invitations.filter((i) =>
        tabKey === "admin" ? i.role === "admin" : i.role === "director" || i.role === "member"
      ),
    [invitations]
  );

  const openInviteStaff = (role: "admin" | "director") => {
    setInviteStaffRole(role);
    setInviteStaffEmail("");
    setInviteStaffDisplayName("");
    setGeneratedInviteLink(null);
    setInviteStaffOpen(true);
  };

  const handleCreateStaffInvite = async () => {
    if (!user || !inviteStaffEmail.trim()) return;
    setInviteStaffBusy(true);
    try {
      const email = inviteStaffEmail.trim();
      const roleToSave = inviteStaffRole === "director" ? "director" : "admin";

      const existingProfile = profiles.find((p) => p.email === email);
      if (existingProfile) {
        toast({ title: "エラー", description: "このメールアドレスは既に登録されています", variant: "destructive" });
        setInviteStaffBusy(false);
        return;
      }
      const existingInvite = invitations.find((i) => i.email === email);
      if (existingInvite) {
        toast({ title: "エラー", description: "このメールアドレスは既に招待済みです", variant: "destructive" });
        setInviteStaffBusy(false);
        return;
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: invitation, error } = await supabase
        .from("invitations")
        .insert({
          email,
          role: roleToSave,
          display_name: inviteStaffDisplayName.trim() || null,
          invited_by: user.id,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("workspace_members").insert({
        email,
        role: roleToSave,
        status: "pending",
        invited_by: user.id,
      });

      const link = `${window.location.origin}/accept-invite?token=${invitation.token}`;
      setGeneratedInviteLink(link);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "招待の作成に失敗しました";
      toast({ title: "エラー", description: msg, variant: "destructive" });
    }
    setInviteStaffBusy(false);
  };

  const openEditStaff = (p: Profile) => {
    setEditStaffProfile(p);
    setEditStaffRole(isDirectorRole(p.role) ? "director" : "admin");
    setEditStaffActive(p.is_active);
    setEditStaffOpen(true);
  };

  const handleSaveStaffEdit = async () => {
    if (!editStaffProfile) return;
    setEditStaffSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          role: editStaffRole,
          is_active: editStaffActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editStaffProfile.id);
      if (error) throw error;
      const em = editStaffProfile.email;
      if (em) {
        await supabase.from("workspace_members").update({ role: editStaffRole }).eq("email", em);
      }
      toast({ title: "保存しました" });
      setEditStaffOpen(false);
      setEditStaffProfile(null);
      await fetchData();
    } catch (e) {
      toast({ title: "エラー", description: e instanceof Error ? e.message : "保存に失敗しました", variant: "destructive" });
    }
    setEditStaffSaving(false);
  };

  const handleStaffDeactivate = async (p: Profile) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "無効化しました" });
      await fetchData();
    }
    setConfirmStaffDeactivate(null);
  };

  const openCreatorAdd = () => {
    setCreatorMode("add");
    setCreatorEditingId(null);
    setCreatorName("");
    setCreatorEmail("");
    setCreatorNotes("");
    setCreatorEmailError(null);
    setCreatorInviteLink(null);
    setCreatorInviteToken(null);
    setCreatorDialogOpen(true);
  };

  const closeCreatorDialog = async (refresh = false) => {
    setCreatorDialogOpen(false);
    setCreatorEmailError(null);
    setCreatorInviteLink(null);
    setCreatorInviteToken(null);
    if (refresh) await fetchData();
  };

  const copyCreatorInviteLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getCreatorRegisterUrl(token));
      toast({ title: "登録リンクをコピーしました" });
    } catch {
      toast({ title: "コピーに失敗しました", variant: "destructive" });
    }
  };

  const resetCreatorAddForm = () => {
    setCreatorName("");
    setCreatorEmail("");
    setCreatorNotes("");
    setCreatorEmailError(null);
    setCreatorInviteLink(null);
    setCreatorInviteToken(null);
  };

  const openCreatorEdit = (c: Creator) => {
    setCreatorMode("edit");
    setCreatorEditingId(c.id);
    setCreatorName(c.name);
    setCreatorEmail(c.email);
    setCreatorNotes(c.notes ?? "");
    setCreatorEmailError(null);
    setCreatorDialogOpen(true);
  };

  const handleSaveCreator = async () => {
    if (!creatorName.trim() || !creatorEmail.trim()) {
      toast({ title: "入力エラー", description: "名前とメールは必須です", variant: "destructive" });
      return;
    }
    setCreatorSaving(true);
    setCreatorEmailError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (creatorMode === "add") {
        const { data, error } = await supabase
          .from("creators")
          .insert({
            name: creatorName.trim(),
            email: creatorEmail.trim(),
            notes: creatorNotes.trim() || null,
            created_by: uid ?? null,
          })
          .select("id, name, email, invitation_token")
          .single();
        if (error) {
          if (error.code === "23505" || error.message.includes("unique") || error.message.includes("duplicate")) {
            setCreatorEmailError("このメールは既に登録されています");
          } else {
            toast({ title: "エラー", description: error.message, variant: "destructive" });
          }
          setCreatorSaving(false);
          return;
        }
        if (data?.invitation_token) {
          setCreatorInviteToken(data.invitation_token);
          setCreatorInviteLink(getCreatorRegisterUrl(data.invitation_token));
        } else {
          toast({ title: "クリエイターを追加しました", description: "登録リンクを取得できませんでした", variant: "destructive" });
          await closeCreatorDialog(true);
        }
      } else if (creatorEditingId) {
        const { error } = await supabase
          .from("creators")
          .update({
            name: creatorName.trim(),
            email: creatorEmail.trim(),
            notes: creatorNotes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", creatorEditingId);
        if (error) {
          if (error.code === "23505" || error.message.includes("unique")) {
            setCreatorEmailError("このメールは既に登録されています");
          } else {
            toast({ title: "エラー", description: error.message, variant: "destructive" });
          }
          setCreatorSaving(false);
          return;
        }
        toast({ title: "保存しました" });
        await closeCreatorDialog(true);
      }
    } catch (e) {
      toast({ title: "エラー", description: e instanceof Error ? e.message : "保存に失敗しました", variant: "destructive" });
    }
    setCreatorSaving(false);
  };

  const handleCreatorDeactivate = async (c: Creator) => {
    const { error } = await supabase
      .from("creators")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "無効化しました" });
      await fetchData();
    }
    setConfirmCreatorDeactivate(null);
  };

  const renderStaffTable = (list: Profile[], tab: "admin" | "director") => (
    <div className="glass-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className="text-xs w-12" />
            <TableHead className="text-xs">氏名</TableHead>
            <TableHead className="text-xs">メール</TableHead>
            <TableHead className="text-xs whitespace-nowrap">最終ログイン</TableHead>
            {isAdmin ? <TableHead className="text-xs text-right w-24">操作</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((p) => {
            const isMe = p.id === user?.id;
            return (
              <TableRow key={p.id} className="border-b border-border/60">
                <TableCell className="py-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (p.display_name || p.email).charAt(0).toUpperCase()
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-medium">
                  {p.display_name || p.email.split("@")[0]}
                  {isMe ? <span className="text-muted-foreground font-normal ml-1">(自分)</span> : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{p.email}</TableCell>
                <TableCell className="text-xs tabular-nums">{formatDateTime(p.last_login_at)}</TableCell>
                {isAdmin ? <TableCell className="text-right py-2">
                    {!isMe && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditStaff(p)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            編集
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmStaffDeactivate(p)}>
                            <Ban className="h-3.5 w-3.5 mr-2" />
                            無効化
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell> : null}
              </TableRow>
            );
          })}
          {pendingInvitesFor(tab).map((inv) => (
            <TableRow key={inv.id} className="bg-muted/20 border-b border-border/60">
              <TableCell className="py-2">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
              </TableCell>
              <TableCell className="text-xs font-medium">{inv.display_name || inv.email.split("@")[0]}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{inv.email}</TableCell>
              <TableCell className="text-xs text-muted-foreground">招待中</TableCell>
              {isAdmin ? <TableCell /> : null}
            </TableRow>
          ))}
          {list.length === 0 && pendingInvitesFor(tab).length === 0 && (
            <TableRow>
              <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-xs text-muted-foreground py-8">
                該当するメンバーがいません
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (loading && profiles.length === 0 && !loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground text-center py-8">読み込み中...</p>
      </div>
    );
  }

  if (loadError && profiles.length === 0) {
    return (
      <div className="glass-card p-6 text-center space-y-3">
        <p className="text-sm text-destructive">データの取得に失敗しました</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void fetchData()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          再試行
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <Tabs value={staffTab} onValueChange={(v) => setStaffTab(v as typeof staffTab)}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <TabsList className="h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="admin" className="text-xs">
              管理者
            </TabsTrigger>
            <TabsTrigger value="director" className="text-xs">
              ディレクター
            </TabsTrigger>
            <TabsTrigger value="creator" className="text-xs">
              クリエイター
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="admin" className="mt-0 space-y-4">
          <div className="flex justify-end">
            {isAdmin ? <Button type="button" size="sm" className="h-8 text-xs" onClick={() => openInviteStaff("admin")}>
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                管理者を招待
              </Button> : null}
          </div>
          {renderStaffTable(adminProfiles, "admin")}
        </TabsContent>

        <TabsContent value="director" className="mt-0 space-y-4">
          <div className="flex justify-end">
            {isAdmin ? <Button type="button" size="sm" className="h-8 text-xs" onClick={() => openInviteStaff("director")}>
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                ディレクターを招待
              </Button> : null}
          </div>
          {renderStaffTable(directorProfiles, "director")}
        </TabsContent>

        <TabsContent value="creator" className="mt-0 space-y-4">
          {isStaff ? <div className="flex justify-end">
              <Button type="button" size="sm" className="h-8 text-xs" onClick={openCreatorAdd}>
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                クリエイターを追加
              </Button>
            </div> : null}
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border">
                  <TableHead className="text-xs">名前</TableHead>
                  <TableHead className="text-xs">メール</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">最終活動日</TableHead>
                  <TableHead className="text-xs text-right">招待中の案件数</TableHead>
                  {isStaff ? <TableHead className="text-xs text-right w-24">操作</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeCreators.map((c) => (
                  <TableRow key={c.id} className="border-b border-border/60">
                    <TableCell className="text-xs font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-xs tabular-nums">{formatDate(c.last_active_at)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{collabCountByCreator[c.id] ?? 0}</TableCell>
                    {isStaff ? <TableCell className="text-right py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openCreatorEdit(c)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              編集
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void copyCreatorInviteLink(c.invitation_token)}>
                              <Copy className="h-3.5 w-3.5 mr-2" />
                              登録リンクをコピー
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setConfirmCreatorDeactivate(c)}>
                              <Ban className="h-3.5 w-3.5 mr-2" />
                              無効化
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell> : null}
                  </TableRow>
                ))}
                {activeCreators.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isStaff ? 5 : 4} className="text-center text-xs text-muted-foreground py-8">
                      クリエイターが登録されていません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={inviteStaffOpen} onOpenChange={(o) => { setInviteStaffOpen(o); if (!o) { setGeneratedInviteLink(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{generatedInviteLink ? "招待を作成しました" : inviteStaffRole === "admin" ? "管理者を招待" : "ディレクターを招待"}</DialogTitle>
          </DialogHeader>
          {generatedInviteLink ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">招待リンクを共有してください。</p>
              <Input readOnly value={generatedInviteLink} className="h-9 text-xs bg-muted font-mono" />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(generatedInviteLink)}>
                  コピー
                </Button>
                <Button type="button" size="sm" onClick={() => setInviteStaffOpen(false)}>
                  閉じる
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">メールアドレス *</Label>
                <Input type="email" className="h-9 text-sm mt-1" value={inviteStaffEmail} onChange={(e) => setInviteStaffEmail(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">表示名</Label>
                <Input className="h-9 text-sm mt-1" value={inviteStaffDisplayName} onChange={(e) => setInviteStaffDisplayName(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setInviteStaffOpen(false)}>
                  キャンセル
                </Button>
                <Button type="button" size="sm" disabled={inviteStaffBusy || !inviteStaffEmail.trim()} onClick={() => void handleCreateStaffInvite()}>
                  {inviteStaffBusy ? "作成中..." : "招待を作成"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editStaffOpen} onOpenChange={(o) => { if (!o) { setEditStaffOpen(false); setEditStaffProfile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>メンバー編集</DialogTitle>
          </DialogHeader>
          {editStaffProfile ? <div className="space-y-4">
              <p className="text-xs text-muted-foreground truncate">{editStaffProfile.email}</p>
              <div>
                <Label className="text-xs">ロール</Label>
                <Select value={editStaffRole} onValueChange={setEditStaffRole}>
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r === "admin" ? "管理者" : "ディレクター"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label className="text-xs">有効</Label>
                <Switch checked={editStaffActive} onCheckedChange={setEditStaffActive} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditStaffOpen(false)}>
                  キャンセル
                </Button>
                <Button type="button" size="sm" disabled={editStaffSaving} onClick={() => void handleSaveStaffEdit()}>
                  {editStaffSaving ? "保存中..." : "保存"}
                </Button>
              </div>
            </div> : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={creatorDialogOpen}
        onOpenChange={(o) => {
          if (!o) void closeCreatorDialog(creatorInviteLink !== null);
          else setCreatorDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {creatorInviteLink
                ? "クリエイターを追加しました"
                : creatorMode === "add"
                  ? "クリエイターを追加"
                  : "クリエイター編集"}
            </DialogTitle>
          </DialogHeader>
          {creatorInviteLink ? (
            <CreatorInviteLinkPanel
              registerUrl={creatorInviteLink}
              onCopy={() => creatorInviteToken && void copyCreatorInviteLink(creatorInviteToken)}
              secondaryAction={{ label: "もう一人追加", onClick: resetCreatorAddForm }}
              onClose={() => void closeCreatorDialog(true)}
            />
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">名前 *</Label>
                <Input className="h-9 text-sm mt-1" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">メール *</Label>
                <Input className={cn("h-9 text-sm mt-1", creatorEmailError && "border-destructive")} value={creatorEmail} onChange={(e) => { setCreatorEmail(e.target.value); setCreatorEmailError(null); }} />
                {creatorEmailError ? <p className="text-xs text-destructive mt-1">{creatorEmailError}</p> : null}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">メモ</Label>
                <Textarea className="text-sm mt-1 min-h-[80px]" value={creatorNotes} onChange={(e) => setCreatorNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void closeCreatorDialog(false)}>
                  キャンセル
                </Button>
                <Button type="button" size="sm" disabled={creatorSaving} onClick={() => void handleSaveCreator()}>
                  {creatorSaving ? "保存中..." : creatorMode === "add" ? "追加" : "保存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmStaffDeactivate} onOpenChange={(o) => !o && setConfirmStaffDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>このメンバーを無効化しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStaffDeactivate?.email} を無効化するとログインできなくなります。後から再有効化できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => confirmStaffDeactivate && void handleStaffDeactivate(confirmStaffDeactivate)}>
              無効化する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmCreatorDeactivate} onOpenChange={(o) => !o && setConfirmCreatorDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>このクリエイターを無効化しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              進行中の案件招待は引き続き有効です。名簿の一覧からは非表示になります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => confirmCreatorDeactivate && void handleCreatorDeactivate(confirmCreatorDeactivate)}>
              無効化する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
