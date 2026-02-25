import { supabase } from "@/integrations/supabase/client";

export const MATERIAL_TYPES = [
  { id: "orientation", label: "オリエンシート", icon: "📊", color: "#3B82F6" },
  { id: "wcheck", label: "Wチェックシート", icon: "✅", color: "#22C55E" },
  { id: "brand_guideline", label: "ブランドガイドライン", icon: "🎨", color: "#8B5CF6" },
  { id: "legal_rule", label: "法令レギュレーション", icon: "⚖️", color: "#EF4444" },
  { id: "correction_history", label: "修正履歴", icon: "💬", color: "#F59E0B" },
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
  correction_history: `【日付】\n\n【修正依頼元】\n\n【修正内容】\n\n【修正理由】`,
};

export async function fetchMaterials(scopeType: string, scopeId: string): Promise<ReferenceMaterial[]> {
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

export async function gatherReferenceMaterials(projectId: string, productId: string) {
  const [productRes, projectRes, patternsRes] = await Promise.all([
    supabase.from("reference_materials").select("*").eq("scope_type", "product").eq("scope_id", productId).eq("is_active", true).order("sort_order"),
    supabase.from("reference_materials").select("*").eq("scope_type", "project").eq("scope_id", projectId).eq("is_active", true).order("sort_order"),
    supabase.from("correction_patterns").select("*").eq("product_code", productId).eq("auto_apply", true).order("frequency", { ascending: false }).limit(20),
  ]);

  const productMaterials = (productRes.data ?? []) as ReferenceMaterial[];
  const projectMaterials = (projectRes.data ?? []) as ReferenceMaterial[];
  const patterns = patternsRes.data ?? [];

  const groupByType = (mats: ReferenceMaterial[]) => {
    const result: Record<string, string> = {};
    for (const t of MATERIAL_TYPES) {
      result[t.id] = mats.filter(m => m.material_type === t.id).map(m => m.content_text || "").filter(Boolean).join("\n");
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
  };
}

export function extractTextFromXlsx(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
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
