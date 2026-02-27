/**
 * PDF・画像ファイルからテキストを自動抽出するユーティリティ
 * Edge Function (extract-text) 経由でGemini APIを使用
 *
 * - 15MB以下: inlineData方式（高速）
 * - 15MB〜50MB: File APIアップロード → URI参照方式
 * - 50MB超: エラー
 */

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;

function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`ファイルサイズが${MAX_FILE_SIZE_MB}MBを超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）`);
  }
}

function parseDataUri(dataUri: string): { base64: string; mimeType: string } {
  const match = dataUri.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URI format");
  return { mimeType: match[1], base64: match[2] };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function callExtractFunction(base64Data: string, mimeType: string, method: "inline" | "fileApi"): Promise<string> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/extract-text`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Data, mimeType, method }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[file-extractors] Edge Function error:", res.status, errText);
    throw new Error(`テキスト抽出に失敗しました: ${res.status}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

async function extractText(file: File): Promise<string> {
  validateFileSize(file);

  const dataUri = await readFileAsDataUrl(file);
  const { base64, mimeType } = parseDataUri(dataUri);

  if (file.size <= INLINE_LIMIT_BYTES) {
    return callExtractFunction(base64, mimeType, "inline");
  } else {
    console.log(`[file-extractors] Large file (${(file.size / 1024 / 1024).toFixed(1)}MB), using File API upload`);
    return callExtractFunction(base64, mimeType, "fileApi");
  }
}

export async function extractTextFromPdf(file: File): Promise<string> {
  return extractText(file);
}

export async function extractTextFromImage(file: File): Promise<string> {
  return extractText(file);
}

export async function extractTextFromPptx(file: File): Promise<string> {
  return extractText(file);
}
