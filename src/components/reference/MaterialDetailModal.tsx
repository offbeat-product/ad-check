import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MATERIAL_TYPES, type ReferenceMaterial } from "@/lib/reference-materials";
import { getWCheckParsedJson, getWCheckTotalCount } from "@/lib/wcheck-parser";
import WCheckPreview from "./WCheckPreview";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileText, Copy } from "lucide-react";
import MaterialForm from "./MaterialForm";
import CopyMaterialToProductDialog from "./CopyMaterialToProductDialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  materialType: string;
  productId: string;
  projectId: string;
  productName?: string;
  projectName?: string;
  productMaterials: ReferenceMaterial[];
  projectMaterials: ReferenceMaterial[];
  onRefresh: () => void;
}

export default function MaterialDetailModal({
  open, onOpenChange, materialType, productId, projectId,
  productName, projectName, productMaterials, projectMaterials, onRefresh,
}: Props) {
  const { toast } = useToast();
  const mt = MATERIAL_TYPES.find(t => t.id === materialType)!;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [expandedWCheck, setExpandedWCheck] = useState<string | null>(null);
  const [copyMaterial, setCopyMaterial] = useState<ReferenceMaterial | null>(null);
  const [copyAllScope, setCopyAllScope] = useState<"product" | "project" | null>(null);

  const isWCheck = materialType === "wcheck";

  const stripJsonPart = (text: string): string => {
    if (text.includes('---TEMPLATE_JSON---')) return text.split('---TEMPLATE_JSON---')[0].trim();
    if (text.includes('---PARSED_JSON---')) return text.split('---PARSED_JSON---')[0].trim();
    return text;
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("reference_materials").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("reference_materials").delete().eq("id", id);
    toast({ title: "削除しました" });
    onRefresh();
  };

  const allTexts = [
    ...productMaterials.filter(m => m.is_active).map(m => ({ label: "商材ベース", text: m.content_text })),
    ...projectMaterials.filter(m => m.is_active).map(m => ({ label: "案件追加", text: m.content_text })),
  ];

  const renderWCheckSummary = (m: ReferenceMaterial) => {
    if (!isWCheck || !m.content_text) return null;
    const parsed = getWCheckParsedJson(m.content_text);
    if (!parsed) return null;

    const totalItems = getWCheckTotalCount(parsed);
    const sheetCount = Object.keys(parsed).length;

    return (
      <div className="mt-1.5">
        <p className="text-xs text-primary font-medium">
          ● {sheetCount}工程 / {totalItems}項目
        </p>
        {expandedWCheck === m.id ? (
          <>
            <Button size="sm" variant="ghost" className="text-[10px] h-5 px-1" onClick={() => setExpandedWCheck(null)}>
              詳細を閉じる ▲
            </Button>
            <div className="mt-1">
              <WCheckPreview parsedData={parsed} />
            </div>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="text-[10px] h-5 px-1" onClick={() => setExpandedWCheck(m.id)}>
            詳細を表示 ▼
          </Button>
        )}
      </div>
    );
  };

  const renderRow = (m: ReferenceMaterial, readOnly = false) => (
    <div key={m.id} className="border border-border rounded-lg p-3 space-y-1">
      {editingId === m.id ? (
        <MaterialForm
          materialType={materialType}
          scopeType={m.scope_type}
          scopeId={m.scope_id}
          existing={m}
          productId={productId}
          onSaved={() => { setEditingId(null); onRefresh(); }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1 truncate">{m.title || m.file_name || "無題"}</span>
            {m.source_type === "template" && (
              <Badge variant="outline" className="text-[9px] h-4 border-primary/30 text-primary">テンプレート</Badge>
            )}
            <Switch checked={m.is_active} onCheckedChange={(v) => handleToggle(m.id, v)} />
            {!readOnly && (
              <>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="他商材にコピー" onClick={() => setCopyMaterial(m)}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingId(m.id)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDelete(m.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>登録日: {new Date(m.created_at).toLocaleDateString("ja-JP")}</span>
            {m.created_by && <span>登録者: {m.created_by}</span>}
            {m.source_type === "url_reference" && m.source_url && (
              <Badge variant="outline" className="text-[9px] h-4">URL参照</Badge>
            )}
          </div>
          {renderWCheckSummary(m)}
          {!isWCheck && m.content_text && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 line-clamp-2">
              抽出テキスト: 「{stripJsonPart(m.content_text).slice(0, 100)}...」
            </p>
          )}
          {isWCheck && m.content_text && !getWCheckParsedJson(m.content_text) && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 line-clamp-2">
              抽出テキスト: 「{stripJsonPart(m.content_text).slice(0, 100)}...」
            </p>
          )}
        </>
      )}
    </div>
  );

  // For W-check cards on the project page, show enhanced info
  const wcheckSummaryForCard = () => {
    if (!isWCheck) return null;
    const allMats = [...productMaterials, ...projectMaterials].filter(m => m.is_active && m.content_text);
    let totalItems = 0;
    let totalSheets = 0;
    for (const mat of allMats) {
      const parsed = getWCheckParsedJson(mat.content_text!);
      if (parsed) {
        totalItems += getWCheckTotalCount(parsed);
        totalSheets += Object.keys(parsed).length;
      }
    }
    if (totalItems > 0) {
      return { totalSheets, totalItems };
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mt.label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Product-level */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              📦 商材ベース（{productName || "商材"}）
            </h3>
            <div className="space-y-2">
              {productMaterials.length === 0 && !addingProduct && (
                <p className="text-xs text-muted-foreground/60 italic py-2">登録なし</p>
              )}
              {productMaterials.map(m => renderRow(m, false))}
              {addingProduct ? (
                <MaterialForm
                  materialType={materialType}
                  scopeType="product"
                  scopeId={productId}
                  productId={productId}
                  onSaved={() => { setAddingProduct(false); onRefresh(); }}
                  onCancel={() => setAddingProduct(false)}
                />
              ) : (
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setAddingProduct(true)}>
                  <Plus className="h-3 w-3 mr-1" />商材ベースの資料を追加
                </Button>
              )}
            </div>
          </div>

          {/* Project-level */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              📁 案件固有（{projectName || "案件"}）
            </h3>
            <div className="space-y-2">
              {projectMaterials.length === 0 && !adding && (
                <p className="text-xs text-muted-foreground/60 italic py-2">登録なし</p>
              )}
              {projectMaterials.map(m => renderRow(m))}
              {adding ? (
                <MaterialForm
                  materialType={materialType}
                  scopeType="project"
                  scopeId={projectId}
                  productId={productId}
                  onSaved={() => { setAdding(false); onRefresh(); }}
                  onCancel={() => setAdding(false)}
                />
              ) : (
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setAdding(true)}>
                  <Plus className="h-3 w-3 mr-1" />案件固有の資料を追加
                </Button>
              )}
            </div>
          </div>

          {/* AI Preview - skip parsed JSON part for display */}
          {allTexts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                ── AIに送信されるテキスト（プレビュー）──
              </h3>
              <div className="border border-border rounded-lg p-3 bg-muted/30 max-h-48 overflow-y-auto text-xs font-mono whitespace-pre-wrap">
                {allTexts.map((t, i) => {
                  let displayText = t.text || "(テキストなし)";
                  displayText = stripJsonPart(displayText);
                  return (
                    <div key={i} className="mb-2">
                      <span className="text-primary font-semibold">[{t.label}]</span>
                      <br />
                      {displayText}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <div className="flex gap-2">
            {productMaterials.length > 0 && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setCopyAllScope("product")}>
                <Copy className="h-3 w-3 mr-1" />商材資料を他商材にコピー
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>閉じる</Button>
        </div>
      </DialogContent>

      {/* Single material copy dialog */}
      {copyMaterial && (
        <CopyMaterialToProductDialog
          open={!!copyMaterial}
          onOpenChange={(o) => !o && setCopyMaterial(null)}
          materials={[copyMaterial]}
          currentProductId={productId}
        />
      )}

      {/* Bulk copy dialog */}
      {copyAllScope && (
        <CopyMaterialToProductDialog
          open={!!copyAllScope}
          onOpenChange={(o) => !o && setCopyAllScope(null)}
          materials={copyAllScope === "product" ? productMaterials : projectMaterials}
          currentProductId={productId}
        />
      )}
    </Dialog>
  );
}
