import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MATERIAL_TYPES, type ReferenceMaterial } from "@/lib/reference-materials";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import MaterialForm from "./MaterialForm";

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

  const renderRow = (m: ReferenceMaterial, readOnly = false) => (
    <div key={m.id} className="border border-border rounded-lg p-3 space-y-1">
      {editingId === m.id ? (
        <MaterialForm
          materialType={materialType}
          scopeType={m.scope_type}
          scopeId={m.scope_id}
          existing={m}
          onSaved={() => { setEditingId(null); onRefresh(); }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1 truncate">{m.title || m.file_name || "無題"}</span>
            <Switch checked={m.is_active} onCheckedChange={(v) => handleToggle(m.id, v)} />
            {!readOnly && (
              <>
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
          {m.content_text && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 line-clamp-2">
              抽出テキスト: 「{m.content_text.slice(0, 100)}...」
            </p>
          )}
        </>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{mt.icon}</span> {mt.label}
          </DialogTitle>
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

          {/* AI Preview */}
          {allTexts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                ── AIに送信されるテキスト（プレビュー）──
              </h3>
              <div className="border border-border rounded-lg p-3 bg-muted/30 max-h-48 overflow-y-auto text-xs font-mono whitespace-pre-wrap">
                {allTexts.map((t, i) => (
                  <div key={i} className="mb-2">
                    <span className="text-primary font-semibold">[{t.label}]</span>
                    <br />
                    {t.text || "(テキストなし)"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>閉じる</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
