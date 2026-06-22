import type { CheckResultRow, ProjectFile } from "@/lib/db-types";
import { AI_CHECK_CONFIG } from "@/lib/process-config";

const MIME_TO_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

const PROCESS_FALLBACK_EXT: Record<string, string> = {
  video_horizontal: ".mp4",
  video_vertical: ".mp4",
  vcon: ".mp4",
  narration: ".mp3",
  bgm: ".mp3",
  script: ".txt",
  na_script: ".txt",
  banner_design: ".png",
  banner_draft: ".png",
  styleframe: ".png",
  storyboard: ".png",
  sf: ".png",
};

function extFromFileName(name: string): string | null {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i >= name.length - 1) return null;
  return name.slice(i).toLowerCase();
}

function extFromContentType(ct: string | null | undefined): string | null {
  if (!ct) return null;
  const main = ct.split(";")[0]?.trim().toLowerCase();
  if (!main) return null;
  return MIME_TO_EXT[main] ?? null;
}

function mimeFromDataUrl(dataUrl: string): string | null {
  const m = /^data:([^;,]+)/i.exec(dataUrl);
  return m?.[1]?.trim().toLowerCase() ?? null;
}

/** If base has an extension, insert date before it; otherwise append date + fallbackExt (with leading dot). */
function buildDatedFileName(baseFileName: string, date: string, fallbackExt: string): string {
  const existing = extFromFileName(baseFileName);
  if (existing) {
    const stem = baseFileName.slice(0, baseFileName.length - existing.length);
    return `${stem}_${date}${existing}`;
  }
  const ext = fallbackExt.startsWith(".") ? fallbackExt : `.${fallbackExt}`;
  return `${baseFileName}_${date}${ext}`;
}

function clickDownload(href: string, download: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = download;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadFromDataUrl(dataUrl: string, fileName: string): void {
  clickDownload(dataUrl, fileName);
}

function downloadPlainText(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  try {
    clickDownload(url, fileName);
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

type DownloadSource = Pick<ProjectFile, "file_data" | "file_type" | "process_type">;

/**
 * Downloads a project file row according to how `file_data` is stored (Storage URL, data URL, or plain text).
 *
 * @param source Row providing `file_data` (often the latest revision).
 * @param displayBaseName Same base as the existing review UI (`file.file_name`) plus `_${date}` rules.
 */
export async function downloadProjectFile(source: DownloadSource, displayBaseName: string): Promise<void> {
  const file_data = source.file_data;
  if (!file_data) return;

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const processKey = source.process_type;

  if (file_data.startsWith("http://") || file_data.startsWith("https://")) {
    const response = await fetch(file_data);
    if (!response.ok) {
      throw new Error(`ダウンロードに失敗しました (${response.status})`);
    }
    const blob = await response.blob();
    const extFromName = extFromFileName(displayBaseName);
    const extFromHeader =
      extFromContentType(response.headers.get("content-type")) ?? extFromContentType(blob.type);
    const fallback = PROCESS_FALLBACK_EXT[processKey] ?? ".bin";
    const chosenExt = extFromName ?? extFromHeader ?? fallback;
    const downloadName = buildDatedFileName(displayBaseName, date, chosenExt);
    const objectUrl = window.URL.createObjectURL(blob);
    try {
      clickDownload(objectUrl, downloadName);
    } finally {
      window.URL.revokeObjectURL(objectUrl);
    }
    return;
  }

  if (file_data.startsWith("data:")) {
    const mime = mimeFromDataUrl(file_data);
    const extFromMime = mime
      ? MIME_TO_EXT[mime] ?? (mime.startsWith("image/") ? ".jpg" : ".bin")
      : ".jpg";
    const extFromName = extFromFileName(displayBaseName);
    const downloadName = buildDatedFileName(displayBaseName, date, extFromName ?? extFromMime);
    downloadFromDataUrl(file_data, downloadName);
    return;
  }

  downloadPlainText(file_data, `${displayBaseName}_${date}.txt`);
}

function fileNameFromStorageUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (!path || !path.includes(".")) return null;
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

function asInputRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function sanitizeFileStem(s: string): string {
  return s.replace(/[<>:"/\\|?*]+/g, "_").trim().slice(0, 120) || "file";
}

export type SharedDownloadPayload = {
  source: Pick<ProjectFile, "file_data" | "file_type" | "process_type">;
  displayBaseName: string;
};

/**
 * Builds download payload from a shared check_results row (input_data shape varies by process and comparison vs initial check).
 */
export function getSharedCheckDownloadPayload(record: CheckResultRow): SharedDownloadPayload | null {
  const pt = record.process_type;
  const inputMode = AI_CHECK_CONFIG[pt]?.inputMode ?? "text";
  const input = asInputRecord(record.input_data);
  const stem = sanitizeFileStem(`${record.product_code}_${pt}`);

  const textBody =
    (typeof input?.script_text === "string" ? input.script_text : "") ||
    (typeof input?.after_text === "string" ? input.after_text : "") ||
    (record.input_text ?? "");

  if (inputMode === "text") {
    const t = textBody.trim();
    if (!t) return null;
    return {
      source: { file_data: textBody, file_type: "text", process_type: pt },
      displayBaseName: stem,
    };
  }

  if (inputMode === "image") {
    const img =
      (typeof input?.image_base64 === "string" ? input.image_base64.trim() : "") ||
      (typeof input?.image_url === "string" ? input.image_url.trim() : "") ||
      (typeof input?.after_image === "string" ? input.after_image.trim() : "") ||
      "";
    if (!img) return null;
    const named =
      (typeof input?.file_name === "string" && input.file_name.trim()) ||
      (img.startsWith("http") ? fileNameFromStorageUrl(img) : null) ||
      `${stem}.jpg`;
    return {
      source: { file_data: img, file_type: "image", process_type: pt },
      displayBaseName: named,
    };
  }

  if (inputMode === "video") {
    const url =
      (typeof input?.video_url === "string" ? input.video_url.trim() : "") ||
      (typeof input?.after_url === "string" ? input.after_url.trim() : "") ||
      "";
    if (!url) return null;
    const fromUrl = url.startsWith("http") ? fileNameFromStorageUrl(url) : null;
    const fallbackExt = PROCESS_FALLBACK_EXT[pt] ?? ".mp4";
    return {
      source: { file_data: url, file_type: "video", process_type: pt },
      displayBaseName: fromUrl || `${stem}${fallbackExt}`,
    };
  }

  if (inputMode === "audio") {
    const au = typeof input?.audio_url === "string" ? input.audio_url.trim() : "";
    const b64 = typeof input?.audio_base64 === "string" ? input.audio_base64.trim() : "";
    const after = typeof input?.after_url === "string" ? input.after_url.trim() : "";
    let file_data = "";
    if (au.startsWith("http://") || au.startsWith("https://")) file_data = au;
    else if (b64) file_data = b64;
    else if (after.startsWith("http://") || after.startsWith("https://")) file_data = after;
    else if (after) file_data = after;
    else if (au) file_data = au;
    if (!file_data.trim()) return null;
    const fallbackExt = PROCESS_FALLBACK_EXT[pt] ?? ".mp3";
    const fromUrl =
      file_data.startsWith("http://") || file_data.startsWith("https://")
        ? fileNameFromStorageUrl(file_data)
        : null;
    return {
      source: { file_data, file_type: "audio", process_type: pt },
      displayBaseName: fromUrl || `${stem}${fallbackExt}`,
    };
  }

  return null;
}
