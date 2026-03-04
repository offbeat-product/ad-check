import type { CheckResult } from "./types";
import { fetchWithRetry, type RetryOptions } from "./fetch-with-retry";
import { resolveWebhookProductId } from "./resolve-product-id";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = "https://offbeat-inc.app.n8n.cloud/webhook";

const WEBHOOK_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  timeoutMs: 120_000,
  initialDelayMs: 2000,
  onRetry: (attempt, error) => {
    console.warn(`[Webhook] Retry ${attempt}: ${error.message}`);
  },
};

/** Video checks: 10-min timeout, no retries (avoid duplicate n8n runs) */
const VIDEO_WEBHOOK_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 0,
  timeoutMs: 600_000,
  initialDelayMs: 0,
};

/** Determine the unified v2 webhook URL based on process type. */
export function getWebhookUrl(processType: string): string | null {
  switch (processType) {
    case "script":
    case "na_script":
      return `${BASE_URL}/check-script-v2`;
    case "sf":
    case "styleframe":
    case "storyboard":
      return `${BASE_URL}/check-sf-v2`;
    case "narration":
    case "bgm":
      return `${BASE_URL}/check-audio-v2`;
    case "vcon":
    case "video_horizontal":
    case "video_vertical":
      return `${BASE_URL}/check-video-v2`;
    default:
      return null;
  }
}

function parseResponse(raw: any): CheckResult {
  let data = raw;
  if (Array.isArray(data)) data = data[0];
  if (data?.data) data = Array.isArray(data.data) ? data.data[0] : data.data;
  if (data?.json) data = data.json;
  if (data?.result && typeof data.result === "object") data = data.result;

  return {
    detected_case: data.detected_case || "",
    design_variant: data.design_variant || "",
    check_items: data.check_items || [],
    overall_status: data.overall_status || "D",
    ng_count: data.ng_count ?? 0,
    warning_count: data.warning_count ?? 0,
    ok_count: data.ok_count ?? 0,
    total_checks: data.total_checks ?? 0,
    manual_count: data.manual_count ?? 0,
  };
}

/** Marker returned when video webhook responds with async acceptance */
export const VIDEO_ASYNC_ACCEPTED = Symbol("VIDEO_ASYNC_ACCEPTED");

export type WebhookResult = CheckResult | typeof VIDEO_ASYNC_ACCEPTED;

export async function webhookFetch(url: string, body: Record<string, any>): Promise<WebhookResult> {
  const isVideo = url.includes("check-video");
  const isAudio = url.includes("check-audio");
  const retryOpts = (isVideo || isAudio) ? VIDEO_WEBHOOK_RETRY_OPTIONS : WEBHOOK_RETRY_OPTIONS;
  console.log("[Webhook] Sending request:", { url, isVideo, timeout: retryOpts.timeoutMs, body: { ...body, image_base64: body.image_base64 ? `[${body.image_base64.length} chars]` : undefined, video_base64: body.video_base64 ? `[${body.video_base64.length} chars]` : undefined, audio_base64: body.audio_base64 ? `[${body.audio_base64.length} chars]` : undefined } });
  try {
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      retryOpts
    );

    // Handle empty or non-JSON responses gracefully
    const responseText = await res.text();
    if (!responseText || responseText.trim() === "") {
      console.error("[Webhook] Empty response received from:", url);
      throw new Error("AIモデルが一時的に高負荷のため応答がありませんでした。しばらく待ってから再度お試しください。");
    }

    let raw: any;
    try {
      raw = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[Webhook] Failed to parse response:", responseText.substring(0, 500));
      if (responseText.includes("Service unavailable") || responseText.includes("high demand")) {
        throw new Error("AIモデルが一時的に高負荷です。数分後に再度お試しください。");
      }
      throw new Error("サーバーからの応答を解析できませんでした。しばらく待ってから再度お試しください。");
    }

    // Detect n8n error responses (e.g. Gemini 503 wrapped in AxiosError)
    const errorCandidate = Array.isArray(raw) ? raw[0] : raw;
    if (errorCandidate?.error) {
      const errMsg = typeof errorCandidate.error === "string"
        ? errorCandidate.error
        : errorCandidate.error?.message || JSON.stringify(errorCandidate.error);
      console.error("[Webhook] n8n returned error object:", errMsg);
      if (errMsg.includes("high demand") || errMsg.includes("503") || errMsg.includes("UNAVAILABLE")) {
        throw new Error("AIモデルが一時的に高負荷です。数分後に再度お試しください。");
      }
      if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("rate limit")) {
        throw new Error("APIレート制限に達しました。数分後に再度お試しください。");
      }
      throw new Error(`チェック処理でエラーが発生しました: ${errMsg.substring(0, 100)}`);
    }

    console.log("[Webhook] Response received:", { status: res.status, raw });

    // Detect async acceptance from n8n (video & audio checks)
    // n8n saves results directly to DB and returns {success: true, record_id: "..."}
    // or "Immediately" mode returns {"message": "Workflow was started"}
    const isAsync = isVideo || url.includes("check-audio");
    if (isAsync) {
      let candidate = raw;
      if (Array.isArray(candidate)) candidate = candidate[0];
      if (candidate && typeof candidate === "object") {
        const statusVal = candidate.status;
        const messageVal = candidate.message;
        const successVal = candidate.success;
        const recordIdVal = candidate.record_id;
        const hasCheckItems = candidate.check_items || (candidate.data && candidate.data.check_items);
        if (
          statusVal === "accepted" ||
          messageVal === "Workflow was started" ||
          (successVal === true && recordIdVal) ||
          !hasCheckItems
        ) {
          console.log("[Webhook] Async check accepted — will poll for results", { statusVal, messageVal, successVal, recordIdVal });
          return VIDEO_ASYNC_ACCEPTED;
        }
      }
    }

    return parseResponse(raw);
  } catch (err) {
    console.error("[Webhook] Request failed:", { url, error: err });
    throw err;
  }
}

export async function runScriptCheck(productId: string, scriptText: string, processType: string = "script", referenceContext?: string): Promise<CheckResult> {
  const webhookProductId = await resolveWebhookProductId(productId);
  const body: Record<string, any> = { product_id: webhookProductId, process_type: processType, script_text: scriptText };
  if (referenceContext) {
    try { body.reference_context = JSON.parse(referenceContext); } catch { body.reference_context = referenceContext; }
  }
  const url = getWebhookUrl(processType)!;
  if (!url) throw new Error(`この工程(${processType})のWebhookが見つかりません`);
  return webhookFetch(url, body) as Promise<CheckResult>;
}

export async function runSfCheck(productId: string, imageBase64: string, mediaType: string, processType: string = "styleframe", referenceContext?: string): Promise<CheckResult> {
  const webhookProductId = await resolveWebhookProductId(productId);
  const body: Record<string, any> = { product_id: webhookProductId, process_type: processType, image_base64: imageBase64, media_type: mediaType };
  if (referenceContext) {
    try { body.reference_context = JSON.parse(referenceContext); } catch { body.reference_context = referenceContext; }
  }
  const url = getWebhookUrl(processType)!;
  if (!url) throw new Error(`この工程(${processType})のWebhookが見つかりません`);
  return webhookFetch(url, body) as Promise<CheckResult>;
}

export async function runAudioCheck(
  productId: string,
  processType: string,
  scriptText: string,
  metadata?: { file_name?: string; duration?: number | null; format?: string | null },
  options?: { audioUrl?: string; audioMimeType?: string; audioBase64?: string },
  referenceContext?: string,
  recordId?: string | null
): Promise<CheckResult> {
  const url = getWebhookUrl(processType);
  if (!url) throw new Error(`音声チェックのWebhookが見つかりません (${processType})`);

  const webhookProductId = await resolveWebhookProductId(productId);
  const body: Record<string, any> = {
    product_id: webhookProductId,
    process_type: processType,
    script_text: scriptText,
    audio_url: options?.audioUrl || "",
    audio_mime_type: options?.audioMimeType || "",
    audio_base64: options?.audioBase64 || "",
    audio_description: "",
    metadata: metadata || { file_name: "", duration: null, format: null },
    record_id: recordId || null,
  };
  if (referenceContext) {
    try { body.reference_context = JSON.parse(referenceContext); } catch { body.reference_context = referenceContext; }
  }
  return webhookFetch(url, body) as Promise<CheckResult>;
}

/**
 * Fetch related process files for cross-reference checking.
 * For video checks: script, storyboard, styleframe, na_script, vcon
 * For audio checks (narration/bgm): script, na_script
 * (excluding the current process type) for the same project.
 */
export async function getRelatedProcessData(
  projectId: string,
  currentProcessType: string,
  patternId?: string | null
): Promise<Record<string, { file_data: string; file_name: string; file_type: string }>> {
  if (!projectId) return {};

  // Process order: all processes before the current one are candidates for cross-reference
  const PROCESS_ORDER = ["script", "na_script", "narration", "bgm", "vcon", "styleframe", "storyboard", "video_horizontal", "video_vertical"];
  const currentIndex = PROCESS_ORDER.indexOf(currentProcessType);
  const targetTypes = currentIndex > 0
    ? PROCESS_ORDER.slice(0, currentIndex)
    : [];

  const { data: files } = await supabase
    .from("project_files")
    .select("process_type, file_data, file_name, file_type, pattern_id")
    .eq("project_id", projectId)
    .in("process_type", targetTypes)
    .eq("status", "fixed")
    .order("created_at", { ascending: false });

  if (!files || files.length === 0) return {};

  const relatedData: Record<string, { file_data: string; file_name: string; file_type: string }> = {};
  const seenPattern = new Set<string>(); // pattern-specific wins
  const seenCommon = new Set<string>();  // fallback to common

  for (const f of files as any[]) {
    if (!f.file_data) continue;

    if (patternId) {
      // Pattern-specific file takes priority
      if (f.pattern_id === patternId && !seenPattern.has(f.process_type)) {
        seenPattern.add(f.process_type);
        relatedData[f.process_type] = { file_data: f.file_data, file_name: f.file_name, file_type: f.file_type };
      }
      // Common file (pattern_id null) as fallback
      else if (!f.pattern_id && !seenPattern.has(f.process_type) && !seenCommon.has(f.process_type)) {
        seenCommon.add(f.process_type);
        relatedData[f.process_type] = { file_data: f.file_data, file_name: f.file_name, file_type: f.file_type };
      }
    } else {
      // No pattern context — use any fixed file
      const key = f.process_type;
      if (!seenPattern.has(key)) {
        seenPattern.add(key);
        relatedData[key] = { file_data: f.file_data, file_name: f.file_name, file_type: f.file_type };
      }
    }
  }

  return relatedData;
}

export async function runVideoCheck(
  productId: string,
  processType: string,
  scriptText: string,
  options?: {
    videoUrl?: string;
    videoMimeType?: string;
    videoBase64?: string;
    metadata?: Record<string, any>;
  },
  referenceContext?: string,
  projectId?: string,
  patternId?: string | null,
  recordId?: string | null,
  correctionComments?: { content: string; status: string; check_item_id?: string | null }[]
): Promise<WebhookResult> {
  const url = getWebhookUrl(processType);
  if (!url) throw new Error(`動画チェックのWebhookが見つかりません (${processType})`);

  const webhookProductId = await resolveWebhookProductId(productId);
  const body: Record<string, any> = {
    product_id: webhookProductId,
    process_type: processType,
    script_text: scriptText,
    video_url: options?.videoUrl || "",
    video_mime_type: options?.videoMimeType || "",
    video_base64: options?.videoBase64 || "",
    metadata: options?.metadata || {},
    pattern_id: patternId || null,
    record_id: recordId || null,
  };
  if (referenceContext) {
    try { body.reference_context = JSON.parse(referenceContext); } catch { body.reference_context = referenceContext; }
  }

  // Fetch related process data for cross-reference checking
  if (projectId) {
    const relatedFiles = await getRelatedProcessData(projectId, processType, patternId);
    if (Object.keys(relatedFiles).length > 0) {
      body.related_files = relatedFiles;
      console.log("[Webhook] Including related_files:", Object.keys(relatedFiles));
    }
  }

  // Include correction comments from this creative for the AI to verify fixes
  if (correctionComments && correctionComments.length > 0) {
    body.correction_comments = correctionComments;
    console.log("[Webhook] Including correction_comments:", correctionComments.length);
  }

  return webhookFetch(url, body);
}

export async function runComparisonCheck(
  productId: string,
  processType: string,
  data: {
    script_text?: string;
    original_text?: string;
    image_base64?: string;
    media_type?: string;
    original_image_base64?: string;
  },
  referenceContext?: string,
  correctionComments?: { content: string; status: string; check_item_id?: string | null }[]
): Promise<CheckResult> {
  const isImage = !!data.image_base64;
  const url = getWebhookUrl(isImage ? "styleframe" : "script");
  if (!url) throw new Error("この工程のWebhookはまだ準備中です");

  const webhookProductId = await resolveWebhookProductId(productId);
  const body: Record<string, any> = {
    product_id: webhookProductId,
    process_type: processType,
    check_mode: "comparison",
  };
  if (data.script_text) body.script_text = data.script_text;
  if (data.original_text) body.original_text = data.original_text;
  if (data.image_base64) body.image_base64 = data.image_base64;
  if (data.media_type) body.media_type = data.media_type;
  if (data.original_image_base64) body.original_image_base64 = data.original_image_base64;
  if (referenceContext) {
    try { body.reference_context = JSON.parse(referenceContext); } catch { body.reference_context = referenceContext; }
  }
  // Include correction comments from this creative for the AI to verify fixes
  if (correctionComments && correctionComments.length > 0) {
    body.correction_comments = correctionComments;
    console.log("[Webhook] Including correction_comments:", correctionComments.length);
  }
  return webhookFetch(url, body) as Promise<CheckResult>;
}
