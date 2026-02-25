// DB-driven types for the project-based architecture
export interface Client {
  id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  client_id: string;
  code: string;
  name: string;
  label: string;
  color: string | null;
  rules_desc: string | null;
  meta: string | null;
  sf_enabled: boolean;
  warning: string | null;
  webhook_paths: Record<string, string>;
  sample_text: string | null;
  info_lines: string[] | null;
  created_at: string;
}

export interface Project {
  id: string;
  product_id: string;
  name: string;
  project_code: string | null;
  description: string | null;
  status: string;
  deadline: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  process_type: string;
  file_name: string;
  file_type: string;
  file_data: string | null;
  file_size_bytes: number | null;
  version_number: number;
  parent_file_id: string | null;
  status: string;
  check_result_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectFileStatus = 'uploaded' | 'checking' | 'checked' | 'revision_requested' | 'revised' | 'approved';

export const FILE_STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  uploaded: { label: "未チェック", class: "bg-muted text-muted-foreground" },
  checking: { label: "チェック中", class: "bg-primary/10 text-primary animate-pulse" },
  checked: { label: "チェック済", class: "bg-primary/10 text-primary" },
  revision_requested: { label: "修正依頼", class: "bg-status-warning/10 text-status-warning" },
  revised: { label: "修正済", class: "border border-status-ok text-status-ok" },
  approved: { label: "承認済", class: "bg-status-ok/10 text-status-ok" },
};

export const PROCESS_SECTIONS = [
  { id: "script", label: "① 字コンテ / NA原稿", accepts: ".txt,.docx", allowTextInput: true },
  { id: "styleframe", label: "② スタイルフレーム", accepts: ".jpg,.jpeg,.png,.webp", allowTextInput: false },
  { id: "storyboard", label: "③ 絵コンテ", accepts: ".jpg,.jpeg,.png,.pdf", allowTextInput: false },
  { id: "master", label: "④ 動画マスター", accepts: ".mp4,.mov", allowTextInput: false },
];
