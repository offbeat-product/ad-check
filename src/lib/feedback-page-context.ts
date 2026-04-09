import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const UUID_RE = "[0-9a-fA-F-]{36}";

/** React Router の pathname からページ種別を判定 */
export function getPageContext(pathname: string): { page_name: string; pathname: string } {
  let page_name = "ホーム";
  if (pathname.startsWith("/dashboard")) page_name = "ダッシュボード";
  else if (pathname.startsWith("/client/")) page_name = "クライアント詳細";
  else if (pathname.startsWith("/product/")) page_name = "商材詳細";
  else if (new RegExp(`^/project/${UUID_RE}/file/`).test(pathname)) page_name = "ファイルレビュー";
  else if (pathname.startsWith("/project/")) page_name = "プロジェクト詳細";
  else if (pathname.startsWith("/projects")) page_name = "プロジェクト一覧";
  else if (pathname.startsWith("/products")) page_name = "商材一覧";
  else if (pathname.startsWith("/settings")) page_name = "設定";
  else if (pathname.startsWith("/notifications")) page_name = "通知";
  else if (pathname.startsWith("/report")) page_name = "レポート";
  else if (pathname.startsWith("/rule-candidates")) page_name = "ルール候補";
  else if (pathname.startsWith("/shared/")) page_name = "共有ビュー";
  else if (pathname.startsWith("/accept-invite")) page_name = "招待受諾";
  else if (pathname.startsWith("/login")) page_name = "ログイン";
  return { page_name, pathname };
}

export type ErrorReportContextPayload = {
  page_name: string;
  pathname: string;
  project_name?: string | null;
  product_name?: string | null;
  file_name?: string | null;
  screen_size: string;
  viewport: string;
};

/** error_reports.context_data に格納するオブジェクトを組み立て（DB参照あり） */
export async function buildErrorReportContextData(pathname: string): Promise<ErrorReportContextPayload> {
  const { page_name, pathname: path } = getPageContext(pathname);
  let project_name: string | null = null;
  let product_name: string | null = null;
  let file_name: string | null = null;

  const filePathRe = new RegExp(`^/project/(${UUID_RE})/file/(${UUID_RE})`);
  const projectPathRe = new RegExp(`^/project/(${UUID_RE})`);
  const productPathRe = new RegExp(`^/product/(${UUID_RE})`);

  const fileM = pathname.match(filePathRe);
  const projectM = pathname.match(projectPathRe);
  const productM = pathname.match(productPathRe);

  const projectId = fileM?.[1] ?? projectM?.[1];

  if (projectId) {
    const { data, error } = await supabase
      .from("projects")
      .select("name, products(name)")
      .eq("id", projectId)
      .maybeSingle();

    if (!error && data) {
      project_name = data.name;
      const prod = data.products as { name: string } | null | undefined;
      if (prod?.name) product_name = prod.name;
    }

    if (fileM?.[2]) {
      const { data: f } = await supabase
        .from("project_files")
        .select("file_name")
        .eq("id", fileM[2])
        .maybeSingle();
      file_name = f?.file_name ?? null;
    }
  }

  if (productM?.[1] && !projectId) {
    const pid = productM[1];
    const { data: v, error: vErr } = await supabase
      .from("products_with_check_settings")
      .select("name")
      .eq("id", pid)
      .maybeSingle();
    if (!vErr && v?.name) {
      product_name = v.name;
    } else {
      const { data: p } = await supabase.from("products").select("name").eq("id", pid).maybeSingle();
      product_name = p?.name ?? null;
    }
  }

  const screen_size =
    typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "";
  const viewport =
    typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}` : "";

  return {
    page_name,
    pathname: path,
    project_name,
    product_name,
    file_name,
    screen_size,
    viewport,
  };
}

export function contextPayloadToJson(payload: ErrorReportContextPayload): Json {
  return payload as unknown as Json;
}
