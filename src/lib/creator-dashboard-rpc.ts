import { supabase } from "@/integrations/supabase/client";

export interface CreatorDashboardCreator {
  id: string;
  name: string;
  email: string;
}

export interface CreatorDashboardProject {
  collaborator_id: string;
  project_id: string;
  share_token: string;
  collaborator_is_active: boolean;
  invited_at: string | null;
  last_accessed_at: string | null;
  expires_at: string | null;
  project_name: string;
  project_status: string | null;
  delivery_date: string | null;
  project_updated_at: string | null;
  product_name: string | null;
  client_name: string | null;
  file_count: number;
}

export type CreatorDashboardErrorCode = "invalid_token" | "inactive_creator";

export type CreatorDashboardResult =
  | { kind: "success"; creator: CreatorDashboardCreator; projects: CreatorDashboardProject[] }
  | { kind: "error"; code: CreatorDashboardErrorCode };

function isDashboardErrorCode(value: string): value is CreatorDashboardErrorCode {
  return value === "invalid_token" || value === "inactive_creator";
}

export function parseCreatorDashboardResponse(data: unknown): CreatorDashboardResult | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.error === "string" && isDashboardErrorCode(obj.error)) {
    return { kind: "error", code: obj.error };
  }

  if (!obj.creator || typeof obj.creator !== "object") return null;
  const creator = obj.creator as CreatorDashboardCreator;
  if (!creator.id || !creator.name) return null;

  const projects = Array.isArray(obj.projects)
    ? (obj.projects as CreatorDashboardProject[])
    : [];

  return { kind: "success", creator, projects };
}

export async function fetchCreatorDashboard(invitationToken: string): Promise<CreatorDashboardResult> {
  const { data, error } = await supabase.rpc("get_creator_dashboard", {
    p_invitation_token: invitationToken,
  });
  if (error) throw new Error(error.message);

  const parsed = parseCreatorDashboardResponse(data);
  if (!parsed) throw new Error("ダッシュボードデータの形式が不正です");
  return parsed;
}
