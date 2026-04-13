import type { ProjectFile } from "@/lib/db-types";

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
  styleframe: ".png",
  storyboard: ".png",
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
