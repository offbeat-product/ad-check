export interface CheckItem {
  item: string;
  pattern_id: string;
  status: "NG" | "WARNING" | "OK";
  severity: "high" | "medium" | "low";
  location?: string;
  detail: string;
  suggestion?: string;
  confidence?: number;
}

export interface CheckResult {
  detected_case?: string;
  design_variant?: string;
  check_items: CheckItem[];
  overall_status: "A" | "B" | "C" | "D";
  ng_count: number;
  warning_count: number;
  ok_count: number;
  total_checks: number;
  manual_count?: number;
}

export interface CheckRecord {
  id: string;
  created_at: string;
  user_id: string;
  client_name: string;
  product_code: string;
  product_name: string;
  process_type: string;
  input_type: string;
  input_text?: string;
  overall_status: string;
  detected_case?: string;
  ng_count: number;
  warning_count: number;
  ok_count: number;
  total_checks: number;
  check_items: CheckItem[];
  raw_response: any;
  status?: string;
  input_data?: { image_base64?: string; script_text?: string } | null;
}

export type CheckStatus = "pending" | "in_progress" | "resolved" | "approved";

export interface Comment {
  id: string;
  check_result_id: string;
  check_item_id?: string;
  author_name: string;
  author_email: string;
  content: string;
  annotation_data?: { x: number; y: number } | null;
  status: "open" | "resolved";
  parent_id?: string | null;
  created_at: string;
}

export interface FileVersion {
  id: string;
  check_result_id: string;
  version_number: number;
  file_type: string;
  content_text?: string | null;
  image_url?: string | null;
  created_at: string;
}

export type ProcessType =
  | "script"
  | "na_script"
  | "narration"
  | "bgm"
  | "vcon"
  | "sf"
  | "styleframe"
  | "storyboard"
  | "video_horizontal"
  | "video_vertical";

export type InputMode = "text" | "image" | "audio" | "video";
