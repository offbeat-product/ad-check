/**
 * get_project_for_creator: ルート JSON に project / product / client / creator / collaborator が入る。
 * get_project_files_for_creator: project_files 行の配列（file_data / check_result_id はパースしない）。
 * get_project_comments_for_creator: JSONB 配列。各要素に created_by_name が含まれる。
 */

export interface CreatorProjectData {
  project_id: string;
  project_name: string;
  product_name: string | null;
  client_name: string | null;
  ob_pm: string | null;
  deadline: string | null;
  overall_deadline: string | null;
  status: string | null;
  creative_type: string | null;
  description: string | null;
  creator_id: string;
  creator_name: string;
  creator_email: string;
  collaborator_id: string;
  invited_at: string;
}

export interface CreatorProjectFile {
  file_id: string;
  parent_file_id: string | null;
  pattern_id: string | null;
  file_name: string;
  file_type: string;
  file_data: string | null;
  process_type: string;
  version_number: number;
  status: string;
  submission_type: string;
  uploaded_by_creator_id: string | null;
  created_at: string;
  file_size_bytes: number | null;
}

export interface CreatorProjectComment {
  comment_id: string;
  comment_text: string;
  severity: string;
  status: string;
  created_at: string;
  created_by_name: string | null;
  parent_id: string | null;
  comment_number?: number | null;
  creator_id: string | null;
}

function firstRecord(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const row = data[0];
    if (row && typeof row === "object" && !Array.isArray(row)) return row as Record<string, unknown>;
    return null;
  }
  if (typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  return null;
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function pickNum(r: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

/** get_project_for_creator の JSON を正規化（ネスト: project.* / product.* / client.* / creator.* / collaborator.*） */
export function parseCreatorProjectPayload(data: unknown): CreatorProjectData | null {
  const root = firstRecord(data);
  if (!root) return null;

  const project = asObject(root.project);
  const product = asObject(root.product);
  const client = asObject(root.client);
  const creator = asObject(root.creator);
  const collaborator = asObject(root.collaborator);

  const projectId = project ? pickStr(project, "id") : null;
  if (!projectId) return null;

  const creatorId = creator ? pickStr(creator, "id") : null;
  if (!creatorId) return null;

  return {
    project_id: projectId,
    project_name: project ? pickStr(project, "name") ?? "" : "",
    product_name: product ? pickStr(product, "name") : null,
    client_name: client ? pickStr(client, "name") : null,
    ob_pm: project ? pickStr(project, "ob_pm") : null,
    deadline: project ? pickStr(project, "deadline") : null,
    overall_deadline: project ? pickStr(project, "overall_deadline") : null,
    status: project ? pickStr(project, "status") : null,
    creative_type: project ? pickStr(project, "creative_type") : null,
    description: project ? pickStr(project, "description") : null,
    creator_id: creatorId,
    creator_name: creator ? pickStr(creator, "name") ?? "" : "",
    creator_email: creator ? pickStr(creator, "email") ?? "" : "",
    collaborator_id: collaborator ? pickStr(collaborator, "id") ?? "" : "",
    invited_at: collaborator ? pickStr(collaborator, "invited_at") ?? "" : "",
  };
}

function asRowArray(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter((x): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
  }
  const one = firstRecord(data);
  return one ? [one] : [];
}

/**
 * get_project_files_for_creator — SETOF project_files。
 * file_data / check_result_id は読まず、CreatorProjectFile にも含めない。
 */
export function parseCreatorProjectFilesPayload(data: unknown): CreatorProjectFile[] {
  return asRowArray(data).map((r) => ({
    file_id: pickStr(r, "id") ?? "",
    parent_file_id: pickStr(r, "parent_file_id"),
    pattern_id: pickStr(r, "pattern_id"),
    file_name: pickStr(r, "file_name") ?? "",
    file_type: pickStr(r, "file_type") ?? "",
    file_data: pickStr(r, "file_data"),
    process_type: pickStr(r, "process_type") ?? "",
    version_number: pickNum(r, "version_number"),
    status: pickStr(r, "status") ?? "",
    submission_type: pickStr(r, "submission_type") ?? "internal",
    uploaded_by_creator_id: pickStr(r, "uploaded_by_creator_id"),
    created_at: pickStr(r, "created_at") ?? "",
    file_size_bytes: (() => {
      const n = pickNum(r, "file_size_bytes");
      return n > 0 ? n : null;
    })(),
  })).filter((f) => f.file_id);
}

/** get_project_comments_for_creator — JSONB 配列（created_by_name を直接参照） */
export function parseCreatorProjectCommentsPayload(data: unknown): CreatorProjectComment[] {
  return asRowArray(data).map((r) => ({
    comment_id: pickStr(r, "id") ?? "",
    comment_text: pickStr(r, "comment_text") ?? "",
    severity: pickStr(r, "severity") ?? "",
    status: pickStr(r, "status") ?? "",
    created_at: pickStr(r, "created_at") ?? "",
    created_by_name: pickStr(r, "created_by_name"),
    parent_id: pickStr(r, "parent_id"),
    creator_id: pickStr(r, "creator_id"),
  })).filter((c) => c.comment_id);
}
