import { supabase } from "@/integrations/supabase/client";

export const MATERIAL_TYPES = [
  { id: "orientation", label: "オリエンシート", icon: "📋", color: "#3B82F6", description: "クライアントからの制作依頼・要件定義" },
  { id: "wcheck", label: "Wチェックシート", icon: "✅", color: "#22C55E", description: "社内QMチェック用・CL確認用チェックリスト" },
  { id: "brand_guideline", label: "ブランドガイドライン", icon: "🎨", color: "#8B5CF6", description: "トンマナ・カラー・フォント・ロゴ使用規定" },
  { id: "legal_rule", label: "法令レギュレーション", icon: "⚖️", color: "#EF4444", description: "薬機法・景表法・業界固有の広告規制" },
  { id: "media_regulation", label: "広告媒体別レギュレーション", icon: "📱", color: "#06B6D4", description: "配信媒体の入稿規定・審査ポリシー" },
  { id: "correction_history", label: "修正履歴", icon: "📝", color: "#F59E0B", description: "過去の修正指示・フィードバック・学び" },
  { id: "meeting_minutes", label: "会議議事録", icon: "🗒️", color: "#64748B", description: "クライアントMTG・社内会議の議事録・決定事項" },
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number]["id"];

export interface ReferenceMaterial {
  id: string;
  scope_type: string;
  scope_id: string;
  material_type: string;
  title: string;
  content_text: string | null;
  file_name: string | null;
  file_data: string | null;
  source_url: string | null;
  source_type: string;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const MATERIAL_TEMPLATES: Record<string, string> = {
  orientation: `【ターゲット】\n\n【訴求軸・メッセージ】\n\n【競合・差別化ポイント】\n\n【NGワード・表現】\n\n【トンマナ・世界観】\n\n【KPI・目標】\n\n【その他注意事項】`,
  wcheck: `【チェック項目一覧】\n□ \n□ \n□ \n\n【特に注意すべきポイント】\n\n【クライアント固有のルール】`,
  brand_guideline: `【ブランドカラー】\nメイン: \nサブ: \nアクセント: \n\n【フォント】\n和文: \n欧文: \n\n【ロゴ使用規定】\n\n【トンマナ】\n\n【NG事項】\n\n【その他ビジュアルルール】`,
  legal_rule: `【適用法令】\n\n【広告表現の禁止事項】\n\n【必須記載事項】\n\n【注意が必要な表現】\n\n【参考条文・ガイドライン】`,
  media_regulation: `【配信媒体】\n\n【入稿規定】\n\n【審査ポリシー】\n\n【セーフゾーン】`,
  correction_history: `【日付】\n\n【修正依頼元】\n\n【修正内容】\n\n【修正理由】`,
  meeting_minutes: `【会議名】\n\n【日時】\n\n【参加者】\n\n【議題・アジェンダ】\n\n【決定事項】\n\n【TODO・アクションアイテム】\n\n【備考・補足】`,
};

export async function fetchMaterials(scopeType: string, scopeId: string): Promise<ReferenceMaterial[]> {
  if (!scopeId) return [];
  const { data, error } = await supabase
    .from("reference_materials")
    .select("*")
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .order("sort_order")
    .order("created_at");
  if (error) console.error("fetchMaterials error:", error);
  return (data ?? []) as ReferenceMaterial[];
}

export async function gatherReferenceMaterials(projectId: string, productId: string, currentProcessKey?: string) {
  const projectQuery = projectId
    ? supabase.from("reference_materials").select("*").eq("scope_type", "project").eq("scope_id", projectId).eq("is_active", true).order("sort_order")
    : Promise.resolve({ data: [], error: null });

  const [productRes, projectRes, patternsRes] = await Promise.all([
    supabase.from("reference_materials").select("*").eq("scope_type", "product").eq("scope_id", productId).eq("is_active", true).order("sort_order"),
    projectQuery,
    supabase.from("correction_patterns").select("*").eq("product_code", productId).eq("auto_apply", true).order("frequency", { ascending: false }).limit(20),
  ]);

  const productMaterials = (productRes.data ?? []) as ReferenceMaterial[];
  const projectMaterials = (projectRes.data ?? []) as ReferenceMaterial[];
  const patterns = patternsRes.data ?? [];

  // Import wcheck parser dynamically
  const { extractWCheckForProcess, getWCheckTextForAI } = await import("@/lib/wcheck-parser");

  const getContentForType = (mats: ReferenceMaterial[], type: string): string => {
    return mats
      .filter(m => m.material_type === type)
      .map(m => {
        const text = m.content_text || "";
        if (type === "wcheck" && currentProcessKey) {
          return extractWCheckForProcess(text, currentProcessKey);
        }
        // Strip parsed JSON for non-wcheck or when no process key
        return getWCheckTextForAI(text);
      })
      .filter(Boolean)
      .join("\n");
  };

  const groupByType = (mats: ReferenceMaterial[]) => {
    const result: Record<string, string> = {};
    for (const t of MATERIAL_TYPES) {
      result[t.id] = getContentForType(mats, t.id);
    }
    return result;
  };

  return {
    product_base: groupByType(productMaterials),
    project_specific: groupByType(projectMaterials),
    correction_patterns: patterns.map(p => ({
      rule_id: p.rule_id,
      title: p.rule_title,
      original: p.original_content,
      corrected: p.corrected_content,
      frequency: p.frequency,
    })),
    process_key: currentProcessKey || null,
  };
}

export function extractTextFromXlsx(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("@e965/xlsx");
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const lines: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          lines.push(`[${sheetName}]\n${csv}`);
        }
        resolve(lines.join("\n\n"));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
