/** File upload validation and size limits */

/** Maximum file size: 5GB for all types */
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
export const MAX_UPLOAD_LABEL = "5GB";

export const FILE_SIZE_LIMITS: Record<string, number> = {
  text: MAX_UPLOAD_SIZE,
  image: MAX_UPLOAD_SIZE,
  audio: MAX_UPLOAD_SIZE,
  video: MAX_UPLOAD_SIZE,
};

export const FILE_SIZE_LABELS: Record<string, string> = {
  text: MAX_UPLOAD_LABEL,
  image: MAX_UPLOAD_LABEL,
  audio: MAX_UPLOAD_LABEL,
  video: MAX_UPLOAD_LABEL,
};

export function getFileCategory(processType: string): keyof typeof FILE_SIZE_LIMITS {
  const audioProcesses = ["narration", "bgm"];
  const videoProcesses = ["vcon", "video_horizontal", "video_vertical"];
  const imageProcesses = ["sf", "styleframe", "storyboard", "banner_design"];
  const kl = processType.toLowerCase();
  if (audioProcesses.includes(processType)) return "audio";
  if (videoProcesses.includes(processType)) return "video";
  if (imageProcesses.includes(processType)) return "image";
  if (kl.includes("banner") || kl.includes("design") || kl.includes("layout")) return "image";
  return "text";
}

export function validateFileSize(file: File, processType: string): string | null {
  const category = getFileCategory(processType);
  const limit = FILE_SIZE_LIMITS[category];
  if (file.size > limit) {
    return `ファイルサイズが上限（${FILE_SIZE_LABELS[category]}）を超えています（${formatFileSize(file.size)}）`;
  }
  return null;
}

export function getUploadLimitLabel(processType: string): string {
  return FILE_SIZE_LABELS[getFileCategory(processType)];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
