import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_MODEL = "gemini-2.5-flash";

const EXTRACT_PROMPT = `あなたはドキュメントからテキストを正確に抽出する専門AIです。
以下のファイルの内容をすべてテキストとして抽出してください。

【ルール】
- 見出し、箇条書き、表などの構造をできるだけ保持してください
- 画像内のテキスト（OCR）も含めてすべて抽出してください
- デザイン要素（色コード、フォント名など）が読み取れる場合は記載してください
- 抽出できない装飾要素は無視してかまいません
- 余計な説明は不要です。抽出したテキストのみを返してください`;

function parseGeminiResponse(data: any): string {
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileUrl, mimeType } = await req.json();

    if (!fileUrl || !mimeType) {
      return new Response(JSON.stringify({ error: "Missing fileUrl or mimeType" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get file size via HEAD request first
    const headRes = await fetch(fileUrl, { method: "HEAD" });
    const contentLength = parseInt(headRes.headers.get("content-length") || "0", 10);
    const fileSizeMB = contentLength / (1024 * 1024);
    console.log(`Processing file: ~${fileSizeMB.toFixed(1)}MB, type: ${mimeType}`);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    if (contentLength <= 8 * 1024 * 1024) {
      // Small file (≤8MB): inlineData - safe for edge function memory
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);
      const fileBytes = new Uint8Array(await fileRes.arrayBuffer());

      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < fileBytes.length; i += chunkSize) {
        const chunk = fileBytes.subarray(i, Math.min(i + chunkSize, fileBytes.length));
        binary += String.fromCharCode(...chunk);
      }
      const base64Data = btoa(binary);

      const body = {
        contents: [{ parts: [{ inlineData: { mimeType, data: base64Data } }, { text: EXTRACT_PROMPT }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Gemini inlineData error:", res.status, errText);
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify({ text: parseGeminiResponse(data) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Large file (>8MB): Use Gemini File API with streaming upload
      // Stream from storage → Gemini without buffering full file in memory
      const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`;

      // Step 1: Initiate resumable upload
      const initiateRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(contentLength),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { displayName: `extract_${Date.now()}` } }),
      });

      if (!initiateRes.ok) {
        const errText = await initiateRes.text();
        console.error("Upload initiate error:", initiateRes.status, errText);
        throw new Error(`File upload initiate failed: ${initiateRes.status}`);
      }

      const resumeUrl = initiateRes.headers.get("X-Goog-Upload-URL");
      if (!resumeUrl) throw new Error("No upload URL returned");

      // Step 2: Stream file directly from storage to Gemini
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);

      const uploadRes = await fetch(resumeUrl, {
        method: "PUT",
        headers: {
          "X-Goog-Upload-Command": "upload, finalize",
          "X-Goog-Upload-Offset": "0",
          "Content-Type": mimeType,
        },
        // Stream the body directly without buffering
        body: fileRes.body,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error("Upload finalize error:", uploadRes.status, errText);
        throw new Error(`File upload failed: ${uploadRes.status}`);
      }

      const uploadResult = await uploadRes.json();
      const fileInfo = uploadResult.file;
      if (!fileInfo?.name || !fileInfo?.uri) throw new Error("Invalid upload response");

      // Step 3: Poll until ACTIVE
      const filesBase = `https://generativelanguage.googleapis.com/v1beta`;
      const startTime = Date.now();
      while (Date.now() - startTime < 120000) {
        const statusRes = await fetch(`${filesBase}/${fileInfo.name}?key=${GEMINI_API_KEY}`);
        if (!statusRes.ok) throw new Error(`File status check failed: ${statusRes.status}`);
        const statusData = await statusRes.json();
        if (statusData.state === "ACTIVE") break;
        if (statusData.state === "FAILED") throw new Error("File processing failed");
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Step 4: Generate content
      const body = {
        contents: [{ parts: [{ fileData: { mimeType, fileUri: fileInfo.uri } }, { text: EXTRACT_PROMPT }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Gemini fileData error:", res.status, errText);
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify({ text: parseGeminiResponse(data) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("extract-text error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
