export interface BulkSequentialResultRow {
  fileId: string;
  fileName: string;
  success: boolean;
  grade?: string;
  error?: string;
}

export interface BulkQueueEntry {
  id: string;
  projectId: string;
  processType: string;
  projectName: string;
  processLabel: string;
  total: number;
}

/** フローティングバー・ボタン制御用（Provider 状態のマッピング先） */
export interface BatchCheckProgress {
  total: number;
  /** 完了件数（表示用） */
  current: number;
  currentFileName: string;
  status: "idle" | "running" | "done" | "error" | "cancelled";
  results: BulkSequentialResultRow[];
  projectName?: string;
  processLabel?: string;
  waitingN8n?: boolean;
}

/** 一括AIチェック（直列）のグローバル表示用 */
export interface BulkSequentialProgressState {
  status: "running" | "done" | "cancelled";
  projectId: string;
  projectName: string;
  processType: string;
  processLabel: string;
  completed: number;
  total: number;
  currentFileId: string | null;
  currentFileName: string | null;
  /** n8n 非同期結果待ち */
  waitingN8n: boolean;
  results: BulkSequentialResultRow[];
}
