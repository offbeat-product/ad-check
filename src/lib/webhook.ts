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
    default:
      return null; // narration, bgm, video_horizontal, video_vertical — not yet supported
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

export async function runScriptCheck(productId: string, scriptText: string, referenceContext?: string): Promise<CheckResult> {
  const body: Record<string, string> = { product_id: productId, script_text: scriptText };
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

export async function runSfCheck(productId: string, imageBase64: string, mediaType: string, referenceContext?: string): Promise<CheckResult> {
  const body: Record<string, string> = { product_id: productId, image_base64: imageBase64, media_type: mediaType };
  if (referenceContext) body.reference_context = referenceContext;

  const url = getWebhookUrl("sf");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
  const raw = await res.json();
  return parseResponse(raw);
}
