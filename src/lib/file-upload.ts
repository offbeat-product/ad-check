import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { getFileCategory } from "@/lib/file-validation";
import { tusUpload } from "@/lib/tus-upload";

export type UploadPreparedFileType = "video" | "image" | "audio" | "text";
export type UploadStorageBucket = "audios" | "videos" | "deliverables";

export interface PrepareFileForUploadInput {
  file: File;
  processType: string;
  projectId: string;
  fileNamePrefix?: string;
  onProgress?: (progressPercent: number) => void;
}

export interface PreparedUploadFile {
  fileType: UploadPreparedFileType;
  fileData: string;
  fileSizeBytes: number;
}

function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot > 0 ? name.slice(lastDot) : "";
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const safeName = base
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${safeName || `file_${Date.now()}`}${ext}`;
}

function isCompressibleImage(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return Boolean(ext && ["jpg", "jpeg", "png", "webp"].includes(ext) && file.type.startsWith("image/"));
}

export function getStorageBucket(processType: string, file?: File): UploadStorageBucket | null {
  const audioProcesses = ["narration", "bgm"];
  const videoProcesses = ["vcon", "video_horizontal", "video_vertical"];
  if (audioProcesses.includes(processType)) return "audios";
  if (videoProcesses.includes(processType)) return "videos";
  const category = getFileCategory(processType);
  if (category === "audio") return "audios";
  if (category === "video") return "videos";
  if (category === "image" && file && !isCompressibleImage(file)) return "deliverables";
  return null;
}

async function uploadToStorageWithFallback(args: {
  bucket: UploadStorageBucket;
  path: string;
  file: File;
  onProgress?: (progressPercent: number) => void;
}): Promise<string> {
  const { bucket, path, file, onProgress } = args;
  try {
    const result = await tusUpload({
      bucketName: bucket,
      path,
      file,
      contentType: file.type,
      onProgress,
    });
    return result.publicUrl;
  } catch (err) {
    console.warn("[prepareFileForUpload] tus upload failed, fallback to storage.upload:", err);
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    onProgress?.(100);
    return data.publicUrl;
  }
}

export async function prepareFileForUpload(input: PrepareFileForUploadInput): Promise<PreparedUploadFile> {
  const { file, processType, projectId, fileNamePrefix, onProgress } = input;
  const fileName = sanitizeFileName(file.name);
  const bucket = getStorageBucket(processType, file);

  if (bucket) {
    const storagePath = `${projectId}/${fileNamePrefix ? `${fileNamePrefix}_` : ""}${Date.now()}_${fileName}`;
    const url = await uploadToStorageWithFallback({
      bucket,
      path: storagePath,
      file,
      onProgress,
    });
    return {
      fileType: bucket === "audios" ? "audio" : bucket === "videos" ? "video" : "image",
      fileData: url,
      fileSizeBytes: file.size,
    };
  }

  const category = getFileCategory(processType);
  if (category === "image" || isCompressibleImage(file)) {
    const compressed = await compressImage(file);
    return {
      fileType: "image",
      fileData: `data:${compressed.mediaType};base64,${compressed.base64}`,
      fileSizeBytes: file.size,
    };
  }

  return {
    fileType: "text",
    fileData: await file.text(),
    fileSizeBytes: file.size,
  };
}
