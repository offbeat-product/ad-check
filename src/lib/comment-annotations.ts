export interface CommentAnnotationData {
  type: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  text?: string;
  imagePosition?: { x: number; y: number; width: number; height: number };
}

function isAnnotation(value: unknown): value is CommentAnnotationData {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "type" in value &&
      "points" in value &&
      Array.isArray((value as { points?: unknown }).points)
  );
}

export function normalizeAnnotations(annotationData: unknown): CommentAnnotationData[] {
  if (!annotationData || typeof annotationData !== "object" || Array.isArray(annotationData)) return [];

  const maybeWrapped = annotationData as { annotations?: unknown };
  if (Array.isArray(maybeWrapped.annotations)) {
    return maybeWrapped.annotations.filter(isAnnotation);
  }

  return isAnnotation(annotationData) ? [annotationData] : [];
}

export function isValidMediaTimestamp(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

export const MEDIA_TIMESTAMP_IN_TEXT_RE = /\[(\d+):(\d{2})\.(\d{3})\]/;

export function parseTimestampFromText(text: string): number | null {
  const match = text.match(MEDIA_TIMESTAMP_IN_TEXT_RE);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 1000;
}

export function resolveSeekSeconds(content: string, mediaTimestamp: unknown): number | null {
  if (isValidMediaTimestamp(mediaTimestamp)) return mediaTimestamp;
  return parseTimestampFromText(content);
}
