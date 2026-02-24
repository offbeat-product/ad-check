import type { CheckResult } from "./types";

const BASE_URL = "https://offbeat-inc.app.n8n.cloud/webhook";

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

export async function runScriptCheck(webhookPath: string, scriptText: string): Promise<CheckResult> {
  const res = await fetch(`${BASE_URL}/${webhookPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script_text: scriptText }),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
  const raw = await res.json();
  return parseResponse(raw);
}

export async function runSfCheck(imageBase64: string, mediaType: string): Promise<CheckResult> {
  const res = await fetch(`${BASE_URL}/tmdaga-sf-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64, media_type: mediaType }),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
  const raw = await res.json();
  return parseResponse(raw);
}
