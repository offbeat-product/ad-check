// DB-driven types derived from Supabase generated types for type safety
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

// Row types (read)
export type Client = Tables<"clients">;
export type Product = Tables<"products">;
export type Project = Tables<"projects">;
export type ProjectFile = Tables<"project_files">;
export type CheckResultRow = Tables<"check_results">;
export type CommentRow = Tables<"comments">;
export type CorrectionPatternRow = Tables<"correction_patterns">;
export type FileVersionRow = Tables<"file_versions">;
export type ShareLinkRow = Tables<"share_links">;

// Insert types
export type ProjectInsert = TablesInsert<"projects">;
export type ProjectFileInsert = TablesInsert<"project_files">;
export type CheckResultInsert = TablesInsert<"check_results">;
export type CommentInsert = TablesInsert<"comments">;
export type CorrectionPatternInsert = TablesInsert<"correction_patterns">;

// Update types
export type ProjectFileUpdate = TablesUpdate<"project_files">;
export type CheckResultUpdate = TablesUpdate<"check_results">;

// Helper to safely cast webhook_paths from Json
export function getWebhookPaths(product: Product): Record<string, string> {
  if (!product.webhook_paths || typeof product.webhook_paths !== "object") return {};
  return product.webhook_paths as Record<string, string>;
}

export type ProjectFileStatus = "uploaded" | "checking" | "checked" | "revision_requested" | "revised" | "approved";

export const FILE_STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  uploaded: { label: "未チェック", class: "bg-muted text-muted-foreground" },
  checking: { label: "チェック中", class: "bg-primary/10 text-primary animate-pulse" },
  checked: { label: "チェック済", class: "bg-primary/10 text-primary" },
  revision_requested: { label: "修正依頼", class: "bg-status-warning/10 text-status-warning" },
  revised: { label: "修正済", class: "border border-status-ok text-status-ok" },
  approved: { label: "承認済", class: "bg-status-ok/10 text-status-ok" },
};

// Legacy PROCESS_SECTIONS kept for backward compat (FileReviewPage uses it for upload accept)
export const PROCESS_SECTIONS = [
  { id: "script", label: "① 構成/字コンテ", accepts: ".txt,.docx", allowTextInput: true },
  { id: "na_script", label: "② NA原稿", accepts: ".txt,.docx", allowTextInput: true },
  { id: "narration", label: "③ ナレーション", accepts: ".mp3,.wav,.m4a", allowTextInput: false },
  { id: "bgm", label: "④ BGM", accepts: ".mp3,.wav,.m4a", allowTextInput: false },
  { id: "vcon", label: "⑤ Vコン", accepts: ".mp4,.mov", allowTextInput: false },
  { id: "styleframe", label: "⑥ スタイルフレーム", accepts: ".jpg,.jpeg,.png,.psd,.ai", allowTextInput: false },
  { id: "storyboard", label: "⑦ 絵コンテ", accepts: ".jpg,.jpeg,.png,.pdf,.psd", allowTextInput: false },
  { id: "video_horizontal", label: "⑧ 横動画", accepts: ".mp4,.mov", allowTextInput: false },
  { id: "video_vertical", label: "⑨ 縦動画", accepts: ".mp4,.mov", allowTextInput: false },
];
