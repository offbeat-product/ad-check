/**
 * PDF・画像ファイルからテキストを自動抽出するユーティリティ
 * Gemini APIを使用して、PDF/画像の内容をテキスト化する
 *
 * - 15MB以下: inlineData方式（高速）
 * - 15MB〜50MB: File APIアップロード → URI参照方式
 * - 50MB超: エラー
 */

const GEMINI_API_KEY = "AIzaSyAuXNDQ4yQA_foext7KkCqIHlwyhwCjvsE";
const GEMINI_MODEL = "gemini-2.5-pro";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_UPLOAD_URL = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`;
const GEMINI_FILES_URL = `https://generativelanguage.googleapis.com/v1beta`;

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024; // 15MB以下はinlineData方式

const EXTRACT_PROMPT = `あなたはドキュメントからテキストを正確に抽出する専門AIです。
以下のファイルの内容をすべてテキストとして抽出してください。

【ルール】
- 見出し、箇条書き、表などの構造をできるだけ保持してください
- 画像内のテキスト（OCR）も含めてすべて抽出してください
- デザイン要素（色コード、フォント名など）が読み取れる場合は記載してください
- 抽出できない装飾要素は無視してかまいません
- 余計な説明は不要です。抽出したテキストのみを返してください`;

/**
 * ファイルサイズをチェックする
 */
function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`ファイルサイズが${MAX_FILE_SIZE_MB}MBを超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）`);
  }
}

/**
 * Base64データURIからpure base64とMIMEタイプを分離する
 */
function parseDataUri(dataUri: string): { base64: string; mimeType: string } {
  const match = dataUri.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URI format");
  return { mimeType: match[1], base64: match[2] };
}

/**
 * FileをArrayBufferとして読み込む
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * FileをDataURL (base64) として読み込む
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

// ============================================================
// 方式A: inlineData（15MB以下の小さいファイル用）
// ============================================================

async function extractWithInlineData(base64Data: string, mimeType: string): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: EXTRACT_PROMPT },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
  };

  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[file-extractors] Gemini inlineData error:", res.status, errText);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  return parseGeminiResponse(data);
}

// ============================================================
// 方式B: File APIアップロード（15MB〜50MBの大きいファイル用）
// ============================================================

/**
 * Gemini File APIにファイルをアップロードする
 */
async function uploadToGeminiFileApi(file: File): Promise<{ name: string; uri: string }> {
  const arrayBuffer = await readFileAsArrayBuffer(file);

  // Resumable upload: Step 1 - initiate
  const initiateRes = await fetch(GEMINI_UPLOAD_URL, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": file.type,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { displayName: `extract_${Date.now()}` },
    }),
  });

  if (!initiateRes.ok) {
    const errText = await initiateRes.text();
    console.error("[file-extractors] Upload initiate error:", initiateRes.status, errText);
    throw new Error(`File upload initiate failed: ${initiateRes.status}`);
  }

  const uploadUrl = initiateRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL returned");

  // Resumable upload: Step 2 - upload bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": file.type,
    },
    body: arrayBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error("[file-extractors] Upload finalize error:", uploadRes.status, errText);
    throw new Error(`File upload failed: ${uploadRes.status}`);
  }

  const result = await uploadRes.json();
  const fileInfo = result.file;
  if (!fileInfo?.name || !fileInfo?.uri) {
    throw new Error("Invalid upload response");
  }

  return { name: fileInfo.name, uri: fileInfo.uri };
}

/**
 * ファイルがACTIVE状態になるまでポーリングする
 */
async function waitForFileActive(fileName: string, maxWaitMs = 120000): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(`${GEMINI_FILES_URL}/${fileName}?key=${GEMINI_API_KEY}`);
    if (!res.ok) throw new Error(`File status check failed: ${res.status}`);

    const data = await res.json();
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new Error("File processing failed on Gemini side");

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error("File processing timed out");
}

/**
 * File API経由でアップロード済みファイルのテキストを抽出する
 */
async function extractWithFileApi(fileUri: string, mimeType: string): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          { fileData: { mimeType, fileUri } },
          { text: EXTRACT_PROMPT },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
  };

  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[file-extractors] Gemini fileData error:", res.status, errText);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  return parseGeminiResponse(data);
}

// ============================================================
// 共通ユーティリティ
// ============================================================

function parseGeminiResponse(data: any): string {
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text || "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

/**
 * ファイルサイズに応じて最適な方式でテキストを抽出する
 */
async function extractText(file: File): Promise<string> {
  validateFileSize(file);

  if (file.size <= INLINE_LIMIT_BYTES) {
    // 小さいファイル → inlineData方式（高速）
    const dataUri = await readFileAsDataUrl(file);
    const { base64, mimeType } = parseDataUri(dataUri);
    return extractWithInlineData(base64, mimeType);
  } else {
    // 大きいファイル → File APIアップロード方式
    console.log(`[file-extractors] Large file (${(file.size / 1024 / 1024).toFixed(1)}MB), using File API upload`);
    const { name, uri } = await uploadToGeminiFileApi(file);
    await waitForFileActive(name);
    return extractWithFileApi(uri, file.type);
  }
}

// ============================================================
// 公開API
// ============================================================

/**
 * PDFファイルからテキストを抽出する
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  return extractText(file);
}

/**
 * 画像ファイルからテキストを抽出する（OCR）
 */
export async function extractTextFromImage(file: File): Promise<string> {
  return extractText(file);
}

/**
 * PPTXファイルからテキストを抽出する
 */
export async function extractTextFromPptx(file: File): Promise<string> {
  return extractText(file);
}
