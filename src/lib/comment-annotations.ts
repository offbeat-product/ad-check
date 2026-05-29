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

const LEADING_MEDIA_TIMESTAMP_PREFIX_RE = /^\[(\d+):(\d{2})\.(\d{3})\]\s*/;

export function formatMediaTimestampForComment(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const wholeS = Math.floor(s);
  const ms = Math.round((s - wholeS) * 1000);
  if (ms > 0) {
    return `${m}:${wholeS.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }
  return `${m}:${wholeS.toString().padStart(2, "0")}`;
}

export function stripLeadingMediaTimestampPrefixes(content: string): string {
  let result = content.trimStart();
  while (LEADING_MEDIA_TIMESTAMP_PREFIX_RE.test(result)) {
    result = result.replace(LEADING_MEDIA_TIMESTAMP_PREFIX_RE, "").trimStart();
  }
  return result;
}

export function buildCommentContentWithMediaTimestamp(content: string, seconds: number | null): string {
  const stripped = stripLeadingMediaTimestampPrefixes(content);
  if (!isValidMediaTimestamp(seconds)) return stripped;
  return `[${formatMediaTimestampForComment(seconds)}] ${stripped}`;
}

export function normalizeCommentContentForDisplay(content: string): string {
  const stripped = stripLeadingMediaTimestampPrefixes(content);
  if (stripped === content.trim()) return content;
  const firstMatch = content.match(MEDIA_TIMESTAMP_IN_TEXT_RE);
  if (!firstMatch) return content;
  const seconds = parseTimestampFromText(firstMatch[0]);
  if (seconds == null) return content;
  return buildCommentContentWithMediaTimestamp(stripped, seconds);
}

export function parseTimestampFromText(text: string): number | null {
  const match = text.match(MEDIA_TIMESTAMP_IN_TEXT_RE);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 1000;
}

export function resolveSeekSeconds(content: string, mediaTimestamp: unknown): number | null {
  if (isValidMediaTimestamp(mediaTimestamp)) return mediaTimestamp;
  return parseTimestampFromText(content);
}

const ANNOTATION_VISIBLE_WINDOW_SECONDS = 0.25;

export function shouldShowTimedAnnotation(
  mediaCurrentTime: unknown,
  annotationTimestamp: unknown
): boolean {
  if (!isValidMediaTimestamp(mediaCurrentTime) || !isValidMediaTimestamp(annotationTimestamp)) {
    return false;
  }

  return Math.abs(mediaCurrentTime - annotationTimestamp) <= ANNOTATION_VISIBLE_WINDOW_SECONDS;
}
