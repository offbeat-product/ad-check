import type { BulkSequentialProgressState, BatchCheckProgress } from "@/lib/bulk-sequential-check-types";

export function mapBulkToBatchProgress(
  b: BulkSequentialProgressState | null
): BatchCheckProgress {
  if (!b) {
    return {
      total: 0,
      current: 0,
      currentFileName: "",
      status: "idle",
      results: [],
      waitingN8n: false,
    };
  }
  return {
    total: b.total,
    current: b.completed,
    currentFileName: b.currentFileName || "",
    status:
      b.status === "running"
        ? "running"
        : b.status === "cancelled"
          ? "cancelled"
          : "done",
    results: b.results,
    projectName: b.projectName,
    processLabel: b.processLabel,
    waitingN8n: b.waitingN8n,
  };
}
