export interface CheckItem {
  /** check_results.check_items の jsonb 由来 — OK 等では null になり得る */
  item: string | null;
  pattern_id: string | null;
  status: "NG" | "WARNING" | "OK" | "MANUAL";
  severity: "high" | "medium" | "low";
  location?: string | null;
  detail: string | null;
  suggestion?: string | null;
  confidence?: number;
  timestamp_start?: string | null;
  timestamp_end?: string | null;
  bounding_box?: [number, number, number, number] | null;
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
