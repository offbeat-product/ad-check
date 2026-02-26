import type { CheckResult } from "./types";
import { fetchWithRetry, type RetryOptions } from "./fetch-with-retry";
import { resolveWebhookProductId } from "./resolve-product-id";

const BASE_URL = "https://offbeat-inc.app.n8n.cloud/webhook";

const WEBHOOK_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  timeoutMs: 120_000,
  initialDelayMs: 2000,
  onRetry: (attempt, error) => {
    console.warn(`[Webhook] Retry ${attempt}: ${error.message}`);
  },
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

export async function webhookFetch(url: string, body: Record<string, any>): Promise<CheckResult> {
  console.log("[Webhook] Sending request:", { url, body: { ...body, image_base64: body.image_base64 ? `[${body.image_base64.length} chars]` : undefined, video_base64: body.video_base64 ? `[${body.video_base64.length} chars]` : undefined, audio_base64: body.audio_base64 ? `[${body.audio_base64.length} chars]` : undefined } });
  try {
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      WEBHOOK_RETRY_OPTIONS
    );
    const raw = await res.json();
    console.log("[Webhook] Response received:", { status: res.status, raw });
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
  return webhookFetch(url, body);
}

export async function runSfCheck(productId: string, imageBase64: string, mediaType: string, processType: string = "styleframe", referenceContext?: string): Promise<CheckResult> {
  const webhookProductId = await resolveWebhookProductId(productId);
  const body: Record<string, any> = { product_id: webhookProductId, process_type: processType, image_base64: imageBase64, media_type: mediaType };
  if (referenceContext) {
    try { body.reference_context = JSON.parse(referenceContext); } catch { body.reference_context = referenceContext; }
  }
  const url = getWebhookUrl(processType)!;
  if (!url) throw new Error(`この工程(${processType})のWebhookが見つかりません`);
  return webhookFetch(url, body);
}

export async function runAudioCheck(
  productId: string,
  processType: string,
  scriptText: string,
  metadata?: { file_name?: string; duration?: number | null; format?: string | null },
  options?: { audioUrl?: string; audioMimeType?: string; audioBase64?: string },
  referenceContext?: string
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
  };
  if (referenceContext) {
    try { body.reference_context = JSON.parse(referenceContext); } catch { body.reference_context = referenceContext; }
  }
  return webhookFetch(url, body);
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
  referenceContext?: string
): Promise<CheckResult> {
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
  };
  if (referenceContext) {
    try { body.reference_context = JSON.parse(referenceContext); } catch { body.reference_context = referenceContext; }
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
  referenceContext?: string
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
  return webhookFetch(url, body);
}
