import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export type WaitForAiCheckOutcome = "done" | "cancelled" | "timeout" | "failed";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * 一括チェックの直列実行用: n8n 非同期完了まで project_files / check_results をポーリングする。
 * 完了: project_files.status = checked、または check_results に check_items、または status = completed
 */
export async function waitForAiCheckCompletion(params: {
  fileId: string;
  checkResultId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<WaitForAiCheckOutcome> {
  const { fileId, checkResultId, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = params;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal?.aborted) return "cancelled";

    const { data: file } = await supabase
      .from("project_files")
      .select("status")
      .eq("id", fileId)
      .maybeSingle();

    if (file?.status === "checked") return "done";
    if (file?.status === "uploaded") return "failed";

    const { data: cr } = await supabase
      .from("check_results")
      .select("check_items, status")
      .eq("id", checkResultId)
      .maybeSingle();

    if (cr) {
      const items = cr.check_items;
      if (Array.isArray(items) && items.length > 0) return "done";
      if (cr.status === "completed") return "done";
      if (cr.status === "failed" || cr.status === "abandoned") return "failed";
    }

    try {
      await sleep(POLL_INTERVAL_MS, signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      throw e;
    }
  }

  return "timeout";
}
