/** クリエイター共有リンクのベース（本番は VITE_PUBLIC_APP_URL で固定化可能） */
export function getCreatorPortalOrigin(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

export function getCreatorShareUrl(shareToken: string): string {
  const base = getCreatorPortalOrigin();
  return `${base}/creator/${shareToken}`;
}
