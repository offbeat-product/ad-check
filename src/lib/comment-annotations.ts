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
