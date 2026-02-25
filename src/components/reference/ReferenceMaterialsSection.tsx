import { useState, useEffect, useCallback } from "react";
import { MATERIAL_TYPES, fetchMaterials, type ReferenceMaterial } from "@/lib/reference-materials";
import MaterialDetailModal from "./MaterialDetailModal";
import { ClipboardList } from "lucide-react";

interface Props {
  projectId: string;
  productId: string;
  productName?: string;
  projectName?: string;
}

export default function ReferenceMaterialsSection({ projectId, productId, productName, projectName }: Props) {
  const [productMaterials, setProductMaterials] = useState<ReferenceMaterial[]>([]);
  const [projectMaterials, setProjectMaterials] = useState<ReferenceMaterial[]>([]);
  const [openType, setOpenType] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [pm, prm] = await Promise.all([
      fetchMaterials("product", productId),
      fetchMaterials("project", projectId),
    ]);
    setProductMaterials(pm);
    setProjectMaterials(prm);
  }, [productId, projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">参考資料（AIチェックに自動反映）</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {MATERIAL_TYPES.map((mt) => {
              const pmCount = productMaterials.filter(m => m.material_type === mt.id && m.is_active).length;
              const prCount = projectMaterials.filter(m => m.material_type === mt.id && m.is_active).length;
              const total = pmCount + prCount;
              const sourceLabel = total === 0 ? null
                : pmCount > 0 && prCount > 0 ? `商材${pmCount}+案件${prCount}`
                : pmCount > 0 ? "商材ベース"
                : "案件固有";

              return (
                <button
                  key={mt.id}
                  onClick={() => setOpenType(mt.id)}
                  className="glass-card p-3 text-left hover:border-primary/30 transition-colors group"
                  style={{ borderLeft: `3px solid ${mt.color}` }}
                >
                  <div className="text-2xl mb-1">{mt.icon}</div>
                  <p className="text-xs font-medium leading-tight">{mt.label}</p>
                  {total > 0 ? (
                    <>
                      <p className="text-[10px] text-green-600 mt-1.5 font-medium">✅ {total}件登録</p>
                      <p className="text-[10px] text-muted-foreground">({sourceLabel})</p>
                    </>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5">⬜ 未登録</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {openType && (
        <MaterialDetailModal
          open={!!openType}
          onOpenChange={(o) => !o && setOpenType(null)}
          materialType={openType}
          productId={productId}
          projectId={projectId}
          productName={productName}
          projectName={projectName}
          productMaterials={productMaterials.filter(m => m.material_type === openType)}
          projectMaterials={projectMaterials.filter(m => m.material_type === openType)}
          onRefresh={refresh}
        />
      )}
    </>
  );
}
