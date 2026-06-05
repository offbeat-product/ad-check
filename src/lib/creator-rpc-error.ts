import type { NavigateFunction } from "react-router-dom";

export type CreatorRpcErrorKind = "authentication_required" | "email_mismatch" | "invalid_share_token";

export function getCreatorRpcErrorKind(error: unknown): CreatorRpcErrorKind | null {
  const message =
    error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  if (message.startsWith("authentication_required:")) return "authentication_required";
  if (message.startsWith("email_mismatch:")) return "email_mismatch";
  if (message.startsWith("invalid_share_token:")) return "invalid_share_token";
  return null;
}

export function getCreatorRedirectPath(): string {
  if (typeof window === "undefined") return "/creator/account";
  return `${window.location.pathname}${window.location.search}`;
}

export function handleCreatorRpcError(error: unknown, navigate: NavigateFunction): boolean {
  const kind = getCreatorRpcErrorKind(error);
  if (!kind) return false;

  if (kind === "authentication_required") {
    navigate(`/creator/login?redirect_to=${encodeURIComponent(getCreatorRedirectPath())}`, { replace: true });
    return true;
  }

  if (kind === "email_mismatch") {
    navigate("/creator/access-denied", { replace: true });
    return true;
  }

  navigate("/creator/link-invalid", { replace: true });
  return true;
}
