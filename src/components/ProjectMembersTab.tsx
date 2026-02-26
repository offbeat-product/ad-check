import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Plus, X, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import InviteMemberModal from "./InviteMemberModal";
import type { Tables } from "@/integrations/supabase/types";

type ProjectMember = Tables<"project_members"> & { profile?: { display_name: string | null } };

const ROLE_LABELS: Record<string, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
  editor: "編集者",
  viewer: "閲覧者",
};

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  pending: { label: "招待中", class: "text-status-warning" },
  accepted: { label: "", class: "" },
  declined: { label: "辞退", class: "text-status-ng" },
};

interface ProjectMembersTabProps {
  projectId: string;
  projectName: string;
  ownerId: string | null;
}

export default function ProjectMembersTab({ projectId, projectName, ownerId }: ProjectMembersTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [ownerProfile, setOwnerProfile] = useState<{ email: string; display_name: string | null } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const isOwner = user?.id === ownerId;

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("project_members")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    
    const memberData = data ?? [];
    
    // Fetch display names via RPC (avoids RLS restriction on profiles)
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
      toast({ title: "メンバーを削除しました" });
      fetchMembers();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">プロジェクトメンバー</h2>
        {isOwner && (
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setInviteOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />メンバー招待
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
        {members.map((m) => {
          const st = STATUS_LABELS[m.status] || STATUS_LABELS.pending;
          return (
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
                {st.label && (
                  <span className={cn("text-[10px]", st.class)}>{st.label}</span>
                )}
                {isOwner && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="p-1 rounded hover:bg-muted transition-colors"
                    title="メンバーを削除"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {members.length === 0 && !ownerProfile && (
          <div className="p-8 text-center text-muted-foreground">
            <UserCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">メンバーはまだいません</p>
          </div>
        )}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        projectId={projectId}
        projectName={projectName}
        onInvited={fetchMembers}
      />
    </div>
  );
}
