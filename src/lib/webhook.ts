import type { CheckResult } from "./types";

const BASE_URL = "https://offbeat-inc.app.n8n.cloud/webhook";

/** Determine the unified v2 webhook URL based on process type.
 *  Returns null for process types that are not yet supported. */
export function getWebhookUrl(processType: string): string | null {
  switch (processType) {
    case "script":
    case "na_script":
      return `${BASE_URL}/check-script-v2`;
    case "sf":
    case "styleframe":
    case "storyboard":
    case "vcon":
      return `${BASE_URL}/check-sf-v2`;
    case "narration":
    case "bgm":
      return `${BASE_URL}/check-audio-v2`;
    default:
      return null; // video_horizontal, video_vertical — not yet supported
  }
}

function parseResponse(raw: any): CheckResult {
  let data = raw;

  // Handle array response
  if (Array.isArray(data)) {
    data = data[0];
  }

  // Handle .data property
  if (data?.data) {
    data = Array.isArray(data.data) ? data.data[0] : data.data;
  }

  // Handle .json property
  if (data?.json) {
    data = data.json;
  }

  return {
    detected_case: data.detected_case || "",
    design_variant: data.design_variant || "",
    check_items: data.check_items || [],
    overall_status: data.overall_status || "D",
    ng_count: data.ng_count ?? 0,
    warning_count: data.warning_count ?? 0,
    ok_count: data.ok_count ?? 0,
    total_checks: data.total_checks ?? 0,
  };
}

export async function runScriptCheck(productId: string, scriptText: string, processType: string = "script", referenceContext?: string): Promise<CheckResult> {
  const body: Record<string, string> = { product_id: productId, process_type: processType, script_text: scriptText };
  if (referenceContext) body.reference_context = referenceContext;

  const url = getWebhookUrl("script");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
  const raw = await res.json();
  return parseResponse(raw);
}

export async function runSfCheck(productId: string, imageBase64: string, mediaType: string, processType: string = "sf", referenceContext?: string): Promise<CheckResult> {
  const body: Record<string, string> = { product_id: productId, process_type: processType, image_base64: imageBase64, media_type: mediaType };
  if (referenceContext) body.reference_context = referenceContext;

  const url = getWebhookUrl("sf");
  const res = await fetch(url!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
  const raw = await res.json();
  return parseResponse(raw);
}

/** Run audio check for narration/bgm processes */
export async function runAudioCheck(
  productId: string,
  processType: string,
  scriptText: string,
  metadata?: { file_name?: string; duration?: number | null; format?: string | null },
  referenceContext?: string
): Promise<CheckResult> {
  const url = getWebhookUrl("narration");
  if (!url) throw new Error("音声チェックのWebhookが見つかりません");

  const body: Record<string, any> = {
    product_id: productId,
    process_type: processType,
    script_text: scriptText,
    audio_description: "",
    metadata: metadata || { file_name: "", duration: null, format: null },
    reference_context: referenceContext ? JSON.parse(referenceContext) : {},
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
  const raw = await res.json();
  return parseResponse(raw);
}

/** Run comparison check: sends both original and revised content */
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
  const url = getWebhookUrl(isImage ? "sf" : "script");
  if (!url) throw new Error("この工程のWebhookはまだ準備中です");

  const body: Record<string, string> = {
    product_id: productId,
    process_type: processType,
    check_mode: "comparison",
  };
  if (data.script_text) body.script_text = data.script_text;
  if (data.original_text) body.original_text = data.original_text;
  if (data.image_base64) body.image_base64 = data.image_base64;
  if (data.media_type) body.media_type = data.media_type;
  if (data.original_image_base64) body.original_image_base64 = data.original_image_base64;
  if (referenceContext) body.reference_context = referenceContext;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
  const raw = await res.json();
  return parseResponse(raw);
}
