/**
 * PDF・画像ファイルからテキストを自動抽出するユーティリティ
 * ファイルをSupabase Storageにアップロード後、Edge Function経由でGemini APIを使用
 */

import { supabase } from "@/integrations/supabase/client";
import { tusUpload } from "@/lib/tus-upload";

const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`ファイルサイズが${MAX_FILE_SIZE_MB}MBを超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）`);
  }
}

async function uploadToStorage(file: File): Promise<string> {
  // Sanitize filename: remove non-ASCII, spaces, and special chars
  const ext = file.name.split('.').pop() || 'bin';
  const safeName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const path = `extract-temp/${safeName}`;

  const result = await tusUpload({
    bucketName: "reference-files",
    path,
    file,
    contentType: file.type,
  });

  return result.publicUrl;
}

async function cleanupStorage(fileUrl: string): Promise<void> {
  try {
    const match = fileUrl.match(/reference-files\/(.+)$/);
    if (match) {
      await supabase.storage.from("reference-files").remove([match[1]]);
    }
  } catch {
    // cleanup is best-effort
  }
}

async function callExtractFunction(fileUrl: string, mimeType: string): Promise<string> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/extract-text`;

  // Get auth token for authenticated request
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("認証が必要です。ログインしてください。");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ fileUrl, mimeType }),
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

  console.log(`[file-extractors] Uploading ${(file.size / 1024 / 1024).toFixed(1)}MB to storage...`);
  const fileUrl = await uploadToStorage(file);

  try {
    const text = await callExtractFunction(fileUrl, file.type);
    return text;
  } finally {
    await cleanupStorage(fileUrl);
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
