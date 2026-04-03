/**
 * TUS resumable upload utility for Supabase Storage
 * Supports files up to 5GB with 6MB chunk size, progress tracking, and auto-retry
 */

import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB
const MAX_RETRIES = 3;
const RETRY_DELAYS = [0, 3000, 5000];

export interface TusUploadOptions {
  bucketName: string;
  path: string;
  file: File | Blob;
  contentType?: string;
  upsert?: boolean;
  onProgress?: (percentage: number) => void;
  onError?: (error: Error) => void;
}

export interface TusUploadResult {
  publicUrl: string;
  path: string;
}

/**
 * Upload a file using TUS resumable protocol.
 * Falls back to standard upload for files < 6MB.
 */
export async function tusUpload(options: TusUploadOptions): Promise<TusUploadResult> {
  const {
    bucketName,
    path,
    file,
    contentType,
    upsert = true,
    onProgress,
  } = options;

  const fileSize = file.size;

  // For small files (< 6MB), use standard upload (faster)
  if (fileSize < CHUNK_SIZE) {
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(path, file, { upsert, contentType });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
    onProgress?.(100);
    return { publicUrl: data.publicUrl, path };
  }

  // For larger files, use TUS resumable upload
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("認証が必要です");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  return new Promise<TusUploadResult>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: RETRY_DELAYS,
      chunkSize: CHUNK_SIZE,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": upsert ? "true" : "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName,
        objectName: path,
        contentType: contentType || (file instanceof File ? file.type : "application/octet-stream"),
        cacheControl: "3600",
      },
      onError: (error) => {
        console.error("[tus-upload] Upload failed:", error);
        console.error("[tus-upload] Error details:", {
          message: error.message,
          originalRequest: (error as any).originalRequest,
          originalResponse: (error as any).originalResponse,
          causingError: (error as any).causingError,
        });
        // Try to extract HTTP status from the error
        const originalResponse = (error as any).originalResponse;
        let detail = error.message;
        if (originalResponse) {
          const status = originalResponse.getStatus?.();
          const body = originalResponse.getBody?.();
          console.error("[tus-upload] HTTP status:", status, "body:", body);
          detail = `HTTP ${status}: ${body || error.message}`;
        }
        reject(new Error(`アップロードに失敗しました: ${detail}`));
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress?.(percentage);
      },
      onSuccess: () => {
        const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
        resolve({ publicUrl: data.publicUrl, path });
      },
    });

    // Check for previous uploads to resume
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

/**
 * Upload a Blob (decoded from base64) using TUS.
 * Convenience wrapper for the common pattern of base64 → Blob → upload.
 */
export async function tusUploadBlob(
  bucketName: string,
  storagePath: string,
  base64Data: string,
  mediaType: string,
  onProgress?: (percentage: number) => void,
): Promise<string> {
  const base64Content = base64Data.replace(/^data:[^;]+;base64,/, "");
  const byteChars = atob(base64Content);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: mediaType });

  const result = await tusUpload({
    bucketName,
    path: storagePath,
    file: blob,
    contentType: mediaType,
    onProgress,
  });

  return result.publicUrl;
}
