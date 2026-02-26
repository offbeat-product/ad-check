import { useState, useEffect } from "react";
import { fetchMaterials, MATERIAL_TYPES, type ReferenceMaterial } from "@/lib/reference-materials";
import { getWCheckParsedJson } from "@/lib/wcheck-parser";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip } from "lucide-react";

interface Props {
  projectId: string;
  productId: string;
  processKey?: string;
}

export default function ReferenceStatusIndicator({ projectId, productId, processKey }: Props) {
  const [productMats, setProductMats] = useState<ReferenceMaterial[]>([]);
  const [projectMats, setProjectMats] = useState<ReferenceMaterial[]>([]);
  const [patternCount, setPatternCount] = useState(0);

  useEffect(() => {
    if (!productId || !projectId) return;
    Promise.all([
      fetchMaterials("product", productId),
      fetchMaterials("project", projectId),
      supabase.from("correction_patterns").select("id", { count: "exact", head: true }).eq("product_code", productId).eq("auto_apply", true),
    ]).then(([pm, prm, pRes]) => {
      setProductMats(pm.filter(m => m.is_active));
      setProjectMats(prm.filter(m => m.is_active));
      setPatternCount(pRes.count ?? 0);
    });
  }, [productId, projectId]);

  const totalMats = productMats.length + projectMats.length;
  const totalAll = totalMats + (patternCount > 0 ? 1 : 0);

  const getWCheckInfo = () => {
    const allWCheck = [...productMats, ...projectMats].filter(m => m.material_type === "wcheck");
    let processItemCount = 0;
    let processLabel = "";
    for (const mat of allWCheck) {
      if (!mat.content_text) continue;
      const parsed = getWCheckParsedJson(mat.content_text);
      if (parsed && processKey) {
        for (const data of Object.values(parsed)) {
          if (data.processKeys?.includes(processKey)) {
            processItemCount += data.itemCount;
            if (!processLabel) processLabel = data.label;
          }
        }
      }
    }
    return { processItemCount, processLabel };
  };

  const wcheckInfo = getWCheckInfo();

  if (totalAll === 0) return null;

  const refItems: { label: string; detail: string; active: boolean }[] = [];

  for (const mt of MATERIAL_TYPES) {
    const pmC = productMats.filter(m => m.material_type === mt.id).length;
    const prC = projectMats.filter(m => m.material_type === mt.id).length;
    if (pmC + prC === 0) {
      refItems.push({ label: mt.label, detail: "未登録", active: false });
      continue;
    }
    if (mt.id === "wcheck" && wcheckInfo.processItemCount > 0 && processKey) {
      refItems.push({
        label: mt.label,
        detail: `${wcheckInfo.processLabel} (${wcheckInfo.processItemCount}項目)`,
        active: true,
      });
    } else {
      const label = pmC > 0 && prC > 0 ? `商材ベース + 案件${prC}件`
        : pmC > 0 ? "商材ベース" : `案件${prC}件`;
      refItems.push({ label: mt.label, detail: label, active: true });
    }
  }

  if (patternCount > 0) {
    refItems.push({ label: "修正パターン", detail: `${patternCount}件`, active: true });
  }

  const activeCount = refItems.filter(r => r.active).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors whitespace-nowrap">
          <Paperclip className="h-3 w-3 shrink-0" />
          参考資料 {activeCount}件反映中
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <p className="text-xs font-semibold mb-2">AIチェックに反映される参考資料</p>
        <div className="space-y-1">
          {refItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span>{item.active ? "✅" : "⬜"}</span>
              <span className={item.active ? "" : "text-muted-foreground/60"}>{item.label}</span>
              <span className="text-muted-foreground">({item.detail})</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">
          合計: {activeCount}種の参考情報がAIチェックに反映されます
        </p>
      </PopoverContent>
    </Popover>
  );
}
