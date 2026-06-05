import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getCreatorShareUrl, getCreatorRegisterUrl } from "@/lib/creator-share";
import { CreatorInviteLinkPanel } from "@/components/creator/CreatorInviteLinkPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Plus, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type CreatorRow = Pick<Tables<"creators">, "id" | "name" | "email" | "last_active_at" | "user_id">;

type CollaboratorRow = Pick<
  Tables<"project_collaborators">,
  "id" | "creator_id" | "share_token" | "invited_at" | "last_accessed_at" | "is_active"
>;

type InsertedRow = {
  id: string;
  creator_id: string;
  share_token: string;
  creators: { name: string; email: string } | null;
};

interface CreatorInviteModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvitesChanged: () => void;
}

export function CreatorInviteModal({ projectId, open, onOpenChange, onInvitesChanged }: CreatorInviteModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [phase, setPhase] = useState<"pick" | "done">("pick");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>([]);
  const [invitedAtOpen, setInvitedAtOpen] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [doneLinks, setDoneLinks] = useState<{ name: string; share_token: string }[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addEmailError, setAddEmailError] = useState<string | null>(null);
  const [addInviteUrl, setAddInviteUrl] = useState<string | null>(null);
  const [addInviteToken, setAddInviteToken] = useState<string | null>(null);
  const [newlyAddedCreatorId, setNewlyAddedCreatorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const [collabRes, creatorsRes] = await Promise.all([
        supabase
          .from("project_collaborators")
          .select("id, creator_id, share_token, invited_at, last_accessed_at, is_active")
          .eq("project_id", projectId)
          .eq("is_active", true),
        supabase
          .from("creators")
          .select("id, name, email, last_active_at, user_id")
          .eq("is_active", true)
          .order("name"),
      ]);
      if (collabRes.error) throw collabRes.error;
      if (creatorsRes.error) throw creatorsRes.error;
      const coll = (collabRes.data ?? []) as CollaboratorRow[];
      setCollaborators(coll);
      const invited = new Set(coll.map((c) => c.creator_id));
      setInvitedAtOpen(invited);
      setSelectedIds(new Set(invited));
      setCreators((creatorsRes.data ?? []) as CreatorRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "読み込みに失敗しました";
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setDoneLinks([]);
    setSearch("");
    setFetchError(null);
    void load();
  }, [open, load]);

  const candidateCreators = useMemo(
    () => creators.filter((c) => c.user_id !== null || invitedAtOpen.has(c.id) || selectedIds.has(c.id)),
    [creators, invitedAtOpen, selectedIds]
  );

  const filteredCreators = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidateCreators;
    return candidateCreators.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [candidateCreators, search]);

  const toggleId = (creatorId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(creatorId);
      else next.delete(creatorId);
      return next;
    });
  };

  const copyLink = async (shareToken: string) => {
    const url = getCreatorShareUrl(shareToken);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "共有リンクをコピーしました" });
    } catch {
      toast({ title: "コピーに失敗しました", variant: "destructive" });
    }
  };

  const copyInviteLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getCreatorRegisterUrl(token));
      toast({ title: "登録リンクをコピーしました" });
    } catch {
      toast({ title: "コピーに失敗しました", variant: "destructive" });
    }
  };

  const resetAddForm = () => {
    setAddName("");
    setAddEmail("");
    setAddNotes("");
    setAddEmailError(null);
    setAddInviteUrl(null);
    setAddInviteToken(null);
    setNewlyAddedCreatorId(null);
  };

  const handleInviteNewCreatorToProject = () => {
    if (newlyAddedCreatorId) {
      setSelectedIds((prev) => new Set(prev).add(newlyAddedCreatorId));
    }
    setAddOpen(false);
    resetAddForm();
  };

  const handleCloseAddDialog = () => {
    setAddOpen(false);
    resetAddForm();
  };

  const handleSaveNewCreator = async () => {
    if (!addName.trim() || !addEmail.trim()) {
      toast({ title: "入力エラー", description: "名前とメールは必須です", variant: "destructive" });
      return;
    }
    setAddBusy(true);
    setAddEmailError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      const { data: inserted, error } = await supabase
        .from("creators")
        .insert({
          name: addName.trim(),
          email: addEmail.trim(),
          notes: addNotes.trim() || null,
          created_by: uid ?? null,
        })
        .select("id, name, email, last_active_at, user_id, invitation_token")
        .single();
      if (error) {
        if (error.code === "23505" || error.message.includes("unique") || error.message.includes("duplicate")) {
          setAddEmailError("このメールは既に登録されています");
        } else {
          toast({ title: "エラー", description: error.message, variant: "destructive" });
        }
        setAddBusy(false);
        return;
      }
      if (inserted?.invitation_token) {
        setNewlyAddedCreatorId(inserted.id);
        setAddInviteToken(inserted.invitation_token);
        setAddInviteUrl(getCreatorRegisterUrl(inserted.invitation_token));
        setCreators((prev) => [...prev, inserted as CreatorRow].sort((a, b) => a.name.localeCompare(b.name, "ja")));
      } else {
        toast({ title: "クリエイターを追加しました", description: "登録リンクを取得できませんでした", variant: "destructive" });
        setAddOpen(false);
        resetAddForm();
        if (inserted) {
          setCreators((prev) => [...prev, inserted as CreatorRow].sort((a, b) => a.name.localeCompare(b.name, "ja")));
        } else {
          await load();
        }
      }
    } catch (e) {
      toast({ title: "エラー", description: e instanceof Error ? e.message : "追加に失敗しました", variant: "destructive" });
    }
    setAddBusy(false);
  };

  const handleInvite = async () => {
    if (!user?.id) return;
    const previouslyInvited = invitedAtOpen;
    const toRevoke = [...previouslyInvited].filter((id) => !selectedIds.has(id));
    const newlyChecked = [...selectedIds].filter((id) => !previouslyInvited.has(id));

    setSubmitBusy(true);
    try {
      if (toRevoke.length > 0) {
        const { error: revErr } = await supabase
          .from("project_collaborators")
          .update({ is_active: false })
          .eq("project_id", projectId)
          .in("creator_id", toRevoke);
        if (revErr) throw revErr;
      }

      const insertedSummary: { name: string; share_token: string }[] = [];

      if (newlyChecked.length > 0) {
        const { data: dormant, error: dormErr } = await supabase
          .from("project_collaborators")
          .select("id, creator_id")
          .eq("project_id", projectId)
          .in("creator_id", newlyChecked)
          .eq("is_active", false);
        if (dormErr) throw dormErr;
        const reactivateIds = new Set((dormant ?? []).map((r) => r.creator_id));
        const reactivateRows = (dormant ?? []).map((r) => r.id);

        if (reactivateRows.length > 0) {
          const { error: upErr } = await supabase
            .from("project_collaborators")
            .update({ is_active: true, invited_by: user.id })
            .in("id", reactivateRows);
          if (upErr) throw upErr;
          const { data: reactivated } = await supabase
            .from("project_collaborators")
            .select("id, creator_id, share_token, creators(name, email)")
            .eq("project_id", projectId)
            .in("id", reactivateRows);
          for (const row of (reactivated ?? []) as InsertedRow[]) {
            insertedSummary.push({
              name: row.creators?.name ?? "クリエイター",
              share_token: row.share_token,
            });
          }
        }

        const toInsert = newlyChecked.filter((id) => !reactivateIds.has(id));
        if (toInsert.length > 0) {
          const rows = toInsert.map((creator_id) => ({
            project_id: projectId,
            creator_id,
            invited_by: user.id,
          }));
          const { data: inserted, error: insErr } = await supabase
            .from("project_collaborators")
            .insert(rows)
            .select("id, creator_id, share_token, creators(name, email)");
          if (insErr) {
            if (insErr.code === "23505") {
              toast({
                title: "招待に失敗しました",
                description: "このクリエイターは既に招待されています",
                variant: "destructive",
              });
              setSubmitBusy(false);
              await load();
              return;
            }
            throw insErr;
          }
          for (const row of (inserted ?? []) as InsertedRow[]) {
            insertedSummary.push({
              name: row.creators?.name ?? "クリエイター",
              share_token: row.share_token,
            });
          }
        }
      }

      await load();
      onInvitesChanged();
      if (insertedSummary.length > 0) {
        setDoneLinks(insertedSummary);
        setPhase("done");
      } else {
        toast({ title: newlyChecked.length > 0 || toRevoke.length > 0 ? "保存しました" : "変更はありません" });
        onOpenChange(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "不明なエラー";
      toast({ title: "招待に失敗しました", description: msg, variant: "destructive" });
    }
    setSubmitBusy(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setPhase("pick");
            setDoneLinks([]);
          }
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          {phase === "done" ? (
            <>
              <DialogHeader>
                <DialogTitle>招待が完了しました</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                以下の共有リンクをクリエイターに送ってください。
              </p>
              <ScrollArea className="max-h-[50vh] pr-3">
                <div className="space-y-4 py-2">
                  {doneLinks.map((row) => {
                    const url = getCreatorShareUrl(row.share_token);
                    return (
                      <div key={row.share_token} className="space-y-1.5">
                        <p className="text-sm font-medium">{row.name}</p>
                        <div className="flex items-center gap-2">
                          <Input readOnly value={url} className="h-8 text-xs font-mono bg-muted" />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0"
                            onClick={() => void copyLink(row.share_token)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="flex justify-end pt-2">
                <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
                  閉じる
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>クリエイターを招待</DialogTitle>
              </DialogHeader>

              {fetchError ? (
                <div className="space-y-3 text-center py-4">
                  <p className="text-sm text-destructive">{fetchError}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    再試行
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="h-9 pl-8 text-sm"
                        placeholder="クリエイターを検索..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={() => setAddOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      新規追加
                    </Button>
                  </div>

                  <ScrollArea className="h-[min(52vh,360px)] border rounded-md">
                    <div className="p-2 space-y-0.5">
                      {loading ? (
                        <p className="text-xs text-muted-foreground text-center py-8">読み込み中...</p>
                      ) : (
                        filteredCreators.map((c) => {
                          const wasInvited = invitedAtOpen.has(c.id);
                          const checked = selectedIds.has(c.id);
                          const collab = collaborators.find((x) => x.creator_id === c.id);
                          return (
                            <div
                              key={c.id}
                              className={cn(
                                "flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/40",
                              )}
                            >
                              <Checkbox
                                id={`cr-${c.id}`}
                                checked={checked}
                                onCheckedChange={(v) => toggleId(c.id, v === true)}
                                className="mt-0.5"
                              />
                              <label htmlFor={`cr-${c.id}`} className="flex-1 min-w-0 cursor-pointer">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium">{c.name}</span>
                                  {wasInvited ? <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                                      招待済
                                    </Badge> : null}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                              </label>
                              {wasInvited && collab ? <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs shrink-0"
                                  onClick={() => void copyLink(collab.share_token)}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  共有リンク
                                </Button> : null}
                            </div>
                          );
                        })
                      )}
                      {!loading && filteredCreators.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-8">該当するクリエイターがいません</p>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                      キャンセル
                    </Button>
                    <Button type="button" size="sm" disabled={submitBusy || loading} onClick={() => void handleInvite()}>
                      {submitBusy ? "処理中..." : "招待する"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (!o) resetAddForm();
          setAddOpen(o);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{addInviteUrl ? "クリエイターを追加しました" : "クリエイターを追加"}</DialogTitle>
          </DialogHeader>
          {addInviteUrl ? (
            <CreatorInviteLinkPanel
              registerUrl={addInviteUrl}
              onCopy={() => addInviteToken && void copyInviteLink(addInviteToken)}
              secondaryAction={{ label: "この案件に招待", onClick: handleInviteNewCreatorToProject }}
              hint="登録リンクをコピーしてクリエイターに送付してください。案件招待画面に戻る場合は「この案件に招待」を押してください。"
              onClose={handleCloseAddDialog}
            />
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">名前 *</Label>
                <Input className="h-9 text-sm mt-1" value={addName} onChange={(e) => setAddName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">メール *</Label>
                <Input
                  className={cn("h-9 text-sm mt-1", addEmailError && "border-destructive")}
                  value={addEmail}
                  onChange={(e) => {
                    setAddEmail(e.target.value);
                    setAddEmailError(null);
                  }}
                />
                {addEmailError ? <p className="text-xs text-destructive mt-1">{addEmailError}</p> : null}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">メモ</Label>
                <Textarea className="text-sm mt-1 min-h-[72px]" value={addNotes} onChange={(e) => setAddNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                  キャンセル
                </Button>
                <Button type="button" size="sm" disabled={addBusy} onClick={() => void handleSaveNewCreator()}>
                  {addBusy ? "追加中..." : "追加"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
