export const COMMENT_ATTACHMENT_BUCKET = "comment-attachments";
export const COMMENT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

export interface CommentAttachmentUpload {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  base64: string;
}

export interface CommentAttachmentView {
  id?: string;
  comment_id?: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path?: string | null;
  signed_url: string;
}

export function isImage(mimeType?: string | null) {
  return Boolean(mimeType?.startsWith("image/"));
}

export function humanSize(bytes?: number | null) {
  if (bytes == null || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

export function assertAttachmentSize(file: File) {
  if (file.size > COMMENT_ATTACHMENT_MAX_BYTES) {
    throw new Error(`${file.name} は15MBを超えています。15MB以下のファイルを選択してください。`);
  }
}

export function fileToBase64(file: File): Promise<CommentAttachmentUpload> {
  assertAttachmentSize(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        base64,
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

export async function filesToUploads(files: File[]) {
  files.forEach(assertAttachmentSize);
  return Promise.all(files.map(fileToBase64));
}

export function dataUrlToBlob(dataUrl: string) {
  const [header, payload] = dataUrl.split(",");
  const mimeMatch = header.match(/^data:(.*?);base64$/);
  const mimeType = mimeMatch?.[1] || "application/octet-stream";
  const binary = atob(payload || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function normalizeAttachmentRows(data: unknown): CommentAttachmentView[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((row): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row))
    .map((row) => {
      const signedUrl =
        row.signed_url ?? row.signedUrl ?? row.url ?? row.file_url ?? row.download_url ?? row.public_url;
      const fileName = row.file_name ?? row.name ?? row.attachment_name;
      const storagePath = row.storage_path == null ? null : String(row.storage_path);
      if ((!signedUrl && !storagePath) || !fileName) return null;

      return {
        id: row.id == null ? undefined : String(row.id),
        comment_id: row.comment_id == null ? undefined : String(row.comment_id),
        file_name: String(fileName),
        mime_type:
          row.mime_type == null && row.file_type == null && row.attachment_type == null
            ? null
            : String(row.mime_type ?? row.file_type ?? row.attachment_type),
        size_bytes:
          row.size_bytes == null && row.file_size_bytes == null
            ? null
            : Number(row.size_bytes ?? row.file_size_bytes),
        storage_path: storagePath,
        signed_url: signedUrl == null ? "" : String(signedUrl),
      } satisfies CommentAttachmentView;
    })
    .filter((row): row is CommentAttachmentView => row !== null);
}
