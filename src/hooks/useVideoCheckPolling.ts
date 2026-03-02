import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CheckResultRow } from "@/lib/db-types";

export interface VideoPollingState {
  isPolling: boolean;
  elapsedSeconds: number;
  message: string;
}

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_DURATION_MS = 600_000; // 10 minutes

/**
 * Hook to poll check_results for async video check completion.
 * n8n returns {"status":"accepted"} immediately and writes results to DB later.
 */
export function useVideoCheckPolling() {
  const [pollingState, setPollingState] = useState<VideoPollingState>({
    isPolling: false,
    elapsedSeconds: 0,
    message: "",
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    intervalRef.current = null;
    timerRef.current = null;
    cancelledRef.current = true;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const formatElapsed = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}分${s.toString().padStart(2, "0")}秒`;
    return `${s}秒`;
  };

  /**
   * Start polling for a completed check result.
   * Returns the CheckResultRow when found, or null on timeout.
   */
  const startPolling = useCallback(
    (productCode: string, processType: string, webhookSentAt?: string): Promise<CheckResultRow | null> => {
      cancelledRef.current = false;
      startTimeRef.current = Date.now();
      const sentAt = webhookSentAt || new Date().toISOString();

      setPollingState({
        isPolling: true,
        elapsedSeconds: 0,
        message: "AIが動画を分析中です...（約3〜5分かかります）",
      });

      // Elapsed time counter
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setPollingState((prev) => ({ ...prev, elapsedSeconds: elapsed }));
      }, 1000);

      return new Promise<CheckResultRow | null>((resolve) => {

        const poll = async () => {
          if (cancelledRef.current) {
            cleanup();
            resolve(null);
            return;
          }

          const elapsed = Date.now() - startTimeRef.current;
          if (elapsed > MAX_POLL_DURATION_MS) {
            cleanup();
            setPollingState({
              isPolling: false,
              elapsedSeconds: Math.floor(elapsed / 1000),
              message: "チェック処理がタイムアウトしました。ページを更新して結果を確認してください。",
            });
            resolve(null);
            return;
          }

          try {
            const { data } = await supabase
              .from("check_results")
              .select("*")
              .eq("product_code", productCode)
              .eq("process_type", processType)
              .eq("status", "completed")
              .gte("updated_at", sentAt)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (data && data.check_items) {
              cleanup();
              setPollingState({ isPolling: false, elapsedSeconds: 0, message: "" });
              resolve(data);
              return;
            }
          } catch (err) {
            console.warn("[VideoPolling] Poll error:", err);
          }
        };

        // First poll immediately
        poll();
        // Then every 10 seconds
        intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
      });
    },
    [cleanup]
  );

  const cancelPolling = useCallback(() => {
    cancelledRef.current = true;
    cleanup();
    setPollingState({ isPolling: false, elapsedSeconds: 0, message: "" });
  }, [cleanup]);

  return { pollingState, startPolling, cancelPolling, formatElapsed };
}
