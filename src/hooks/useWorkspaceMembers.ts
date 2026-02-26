import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface WorkspaceMember {
  id: string;
  user_id: string | null;
  email: string;
  role: "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "declined";
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  display_name?: string;
}

export const WORKSPACE_ROLE_CONFIG: Record<string, { label: string; description: string; badgeClass: string }> = {
  admin: { label: "管理者", description: "全操作+メンバー管理+削除", badgeClass: "bg-status-ng/10 text-status-ng" },
  member: { label: "メンバー", description: "編集+アップロード+チェック実行", badgeClass: "bg-primary/10 text-primary" },
  viewer: { label: "閲覧者", description: "閲覧のみ", badgeClass: "bg-muted text-muted-foreground" },
};

export function useWorkspaceMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("workspace_members")
      .select("*")
      .order("created_at");

    if (error) {
      console.error("Failed to fetch workspace members:", error);
      setLoading(false);
      return;
    }

    const memberData = data ?? [];

    // Get display names for members with user_ids
    const userIds = memberData.filter((m) => m.user_id).map((m) => m.user_id!);
    let profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.rpc("get_profiles_by_ids", { p_ids: userIds });
      (profiles ?? []).forEach((p: any) => {
        profileMap[p.id] = p.display_name || p.email?.split("@")[0] || "";
      });
    }

    const enriched: WorkspaceMember[] = memberData.map((m) => ({
      ...m,
      role: m.role as WorkspaceMember["role"],
      status: m.status as WorkspaceMember["status"],
      display_name: m.user_id ? profileMap[m.user_id] : undefined,
    }));

    setMembers(enriched);

    // Set current user's role
    const myMembership = enriched.find((m) => m.user_id === user.id);
    setCurrentRole(myMembership?.role ?? null);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const inviteMember = useCallback(async (email: string, role: string) => {
    if (!user) return { error: "Not authenticated" };

    // Check if already invited
    const existing = members.find((m) => m.email === email);
    if (existing) return { error: "このメールアドレスは既に招待済みです" };

    const { error } = await supabase.from("workspace_members").insert({
      email,
      role,
      status: "pending",
      invited_by: user.id,
    });

    if (error) return { error: error.message };

    // Send notification if user exists
    const { data: profile } = await supabase.rpc("lookup_profile_by_email", { p_email: email });
    if (profile && profile.length > 0) {
      await supabase.from("notifications").insert({
        user_id: profile[0].id,
        type: "workspace_invitation",
        title: "ワークスペースへの招待",
        message: `ワークスペースに${WORKSPACE_ROLE_CONFIG[role]?.label || role}として招待されました`,
        data: { role },
      });
    }

    await fetchMembers();
    return { error: null };
  }, [user, members, fetchMembers]);

  const updateMemberRole = useCallback(async (memberId: string, role: string) => {
    const { error } = await supabase
      .from("workspace_members")
      .update({ role })
      .eq("id", memberId);
    if (!error) await fetchMembers();
    return { error: error?.message ?? null };
  }, [fetchMembers]);

  const removeMember = useCallback(async (memberId: string) => {
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("id", memberId);
    if (!error) setMembers((prev) => prev.filter((m) => m.id !== memberId));
    return { error: error?.message ?? null };
  }, []);

  const isAdmin = currentRole === "admin";

  return {
    members,
    loading,
    currentRole,
    isAdmin,
    inviteMember,
    updateMemberRole,
    removeMember,
    refetch: fetchMembers,
  };
}
