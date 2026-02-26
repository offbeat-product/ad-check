import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";

type ProjectMember = Tables<"project_members"> & { profile?: { display_name: string | null; email?: string } };
type Profile = Tables<"profiles">;

const ROLE_LABELS: Record<string, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
  editor: "編集者",
  viewer: "閲覧者",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive",
  member: "bg-primary/10 text-primary",
  viewer: "bg-muted text-muted-foreground",
};

interface ProjectMembersTabProps {
  projectId: string;
  projectName: string;
  ownerId: string | null;
}

export default function ProjectMembersTab({ projectId, projectName, ownerId }: ProjectMembersTabProps) {
  const { user, canEdit } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [ownerProfile, setOwnerProfile] = useState<{ email: string; display_name: string | null } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("project_members")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    const memberData = data ?? [];

    // Fetch display names via RPC
    const userIds = memberData.filter(m => m.user_id).map(m => m.user_id!);
    const allIds = ownerId ? [...new Set([...userIds, ownerId])] : userIds;

    if (allIds.length > 0) {
      const { data: profiles } = await supabase
        .rpc("get_profiles_by_ids", { p_ids: allIds });

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      setMembers(memberData.map(m => ({
        ...m,
        profile: m.user_id ? profileMap.get(m.user_id) ?? undefined : undefined,
      })));

      if (ownerId) {
        const op = profileMap.get(ownerId);
        setOwnerProfile(op ? { email: op.email, display_name: op.display_name } : null);
      }
    } else {
      setMembers(memberData);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [projectId, ownerId]);

  const handleRemove = async (memberId: string) => {
    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "メンバーを解除しました" });
      fetchMembers();
    }
  };

  const openAssignModal = async () => {
    // Fetch all org profiles
    const { data } = await supabase.from("profiles").select("*").eq("is_active", true).order("created_at");
    setAllProfiles(data ?? []);

    // Pre-select already assigned members
    const assignedIds = new Set<string>();
    if (ownerId) assignedIds.add(ownerId);
    members.forEach(m => { if (m.user_id) assignedIds.add(m.user_id); });
    setSelectedIds(assignedIds);
    setAssignOpen(true);
  };

  const handleSaveAssignments = async () => {
    setSaving(true);
    try {
      const currentMemberUserIds = new Set(members.filter(m => m.user_id).map(m => m.user_id!));

      // Add new members
      const toAdd = [...selectedIds].filter(id => id !== ownerId && !currentMemberUserIds.has(id));
      for (const userId of toAdd) {
        const profile = allProfiles.find(p => p.id === userId);
        if (profile) {
          await supabase.from("project_members").insert({
            project_id: projectId,
            user_id: userId,
            email: profile.email,
            role: "member",
            status: "accepted",
            invited_by: user?.id ?? null,
          });
        }
      }

      // Remove unselected members
      const toRemove = members.filter(m => m.user_id && m.user_id !== ownerId && !selectedIds.has(m.user_id));
      for (const m of toRemove) {
        await supabase.from("project_members").delete().eq("id", m.id);
      }

      toast({ title: "メンバーを更新しました" });
      fetchMembers();
      setAssignOpen(false);
    } catch (err: any) {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleProfile = (id: string) => {
    if (id === ownerId) return; // Can't unassign owner
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">プロジェクトメンバー</h2>
        {canEdit && (
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={openAssignModal}>
            <Plus className="h-3 w-3 mr-1" />メンバーをアサイン
          </Button>
        )}
      </div>

      <div className="glass-card divide-y divide-border overflow-hidden">
        {/* Owner */}
        {ownerProfile && (
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              {(ownerProfile.display_name || ownerProfile.email).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {ownerProfile.display_name || ownerProfile.email.split("@")[0]}
              </p>
              <p className="text-xs text-muted-foreground truncate">{ownerProfile.email}</p>
            </div>
            <span className="text-xs font-medium text-primary shrink-0">オーナー</span>
          </div>
        )}

        {/* Members */}
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold shrink-0">
              {(m.profile?.display_name || m.email).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {m.profile?.display_name || m.email.split("@")[0]}
              </p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium">{ROLE_LABELS[m.role] || m.role}</span>
              {canEdit && m.user_id !== ownerId && (
                <button
                  onClick={() => handleRemove(m.id)}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="メンバーを解除"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        ))}

        {members.length === 0 && !ownerProfile && (
          <div className="p-8 text-center text-muted-foreground">
            <UserCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">メンバーはまだいません</p>
          </div>
        )}
      </div>

      {/* Assign Modal */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>メンバーをアサイン</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">組織メンバーからプロジェクトに参加するメンバーを選択してください。</p>
          <div className="max-h-64 overflow-y-auto space-y-1 mt-2">
            {allProfiles.map((p) => {
              const isOwner = p.id === ownerId;
              const checked = selectedIds.has(p.id);
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                    isOwner && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleProfile(p.id)}
                    disabled={isOwner}
                  />
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {(p.display_name || p.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.display_name || p.email.split("@")[0]}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                  </div>
                  {isOwner && <span className="text-[10px] text-primary">オーナー</span>}
                  <Badge className={cn("text-[9px]", ROLE_BADGE[p.role] || ROLE_BADGE.viewer)}>
                    {ROLE_LABELS[p.role] || p.role}
                  </Badge>
                </label>
              );
            })}
            {allProfiles.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">メンバーがいません</p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>キャンセル</Button>
            <Button size="sm" onClick={handleSaveAssignments} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
