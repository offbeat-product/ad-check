import { useState, useEffect } from "react";
import { fetchMaterials, MATERIAL_TYPES, type ReferenceMaterial } from "@/lib/reference-materials";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClipboardList } from "lucide-react";

interface Props {
  projectId: string;
  productId: string;
}

export default function ReferenceStatusIndicator({ projectId, productId }: Props) {
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

  if (totalAll === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50">
          <ClipboardList className="h-3.5 w-3.5" />
          参考資料: {totalMats + patternCount}件がAIチェックに反映されます
          <span className="text-primary underline ml-1">詳細</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs font-semibold mb-2">AIチェックに反映される資料</p>
        <div className="space-y-1">
          {MATERIAL_TYPES.map((mt) => {
            const pmC = productMats.filter(m => m.material_type === mt.id).length;
            const prC = projectMats.filter(m => m.material_type === mt.id).length;
            if (pmC + prC === 0) return null;
            const label = pmC > 0 && prC > 0 ? `商材ベース + 案件${prC}件`
              : pmC > 0 ? "商材ベース" : `案件${prC}件`;
            return (
              <div key={mt.id} className="flex items-center gap-2 text-xs">
                <span className="text-green-600">✅</span>
                <span>{mt.label}</span>
                <span className="text-muted-foreground">({label})</span>
              </div>
            );
          })}
          {patternCount > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600">✅</span>
              <span>過去の修正パターン</span>
              <span className="text-muted-foreground">({patternCount}件)</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
