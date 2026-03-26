import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ReferenceMaterial } from "@/lib/reference-materials";
import type { Product } from "@/lib/db-types";
import { resolveWebhookProductId } from "@/lib/resolve-product-id";

const PARSE_REFERENCE_URL = "https://offbeat-inc.app.n8n.cloud/webhook/parse-reference";
const ALL_PROCESS_TYPES = ["script", "styleframe", "storyboard", "na_script", "bgm", "narration", "vcon", "video_horizontal", "video_vertical"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The material(s) to copy */
  materials: ReferenceMaterial[];
  /** Current product ID (to exclude from list) */
  currentProductId: string;
}

export default function CopyMaterialToProductDialog({ open, onOpenChange, materials, currentProductId }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [autoGenerateRules, setAutoGenerateRules] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from("products_with_check_settings").select("*").order("name");
      setProducts((data ?? []).filter(p => p.id !== currentProductId));
      setSelectedIds([]);
    })();
  }, [open, currentProductId]);

  const toggle = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map(p => p.id));
    }
  };

  const syncRulesToLocalDb = async (productId: string): Promise<number> => {
    const webhookPid = await resolveWebhookProductId(productId);
    const idsToTry = [webhookPid];
    if (webhookPid !== productId) idsToTry.push(productId);

    // Fetch rules via secure edge function proxy
    const { data: fnData, error: fnError } = await supabase.functions.invoke("fetch-external-rules", {
      body: { product_ids: idsToTry },
    });

    const externalRules: any[] = (fnError || !fnData?.data) ? [] : fnData.data;

    const normalizedRules = externalRules
      .filter((r: any) => r?.rule_id && r?.process_type && r?.category && r?.description)
      .map((r: any) => ({
        product_id: productId, process_type: String(r.process_type), rule_id: String(r.rule_id),
        category: String(r.category), title: String(r.title || ""), description: String(r.description),
        severity: String(r.severity || "medium"), sort_order: Number.isFinite(r.sort_order) ? r.sort_order : 999,
        is_active: r.is_active ?? true,
      }));

    if (normalizedRules.length === 0) return 0;

    let count = 0;
    for (const rule of normalizedRules) {
      const { data: existing } = await supabase.from("check_rules").select("id")
        .eq("product_id", productId).eq("rule_id", rule.rule_id).eq("process_type", rule.process_type).maybeSingle();
      if (existing) {
        await supabase.from("check_rules").update(rule).eq("id", existing.id);
      } else {
        await supabase.from("check_rules").insert(rule);
      }
      count++;
    }
    return count;
  };

  const triggerRuleGenerationForProduct = async (productId: string, text: string) => {
    try {
      const webhookPid = await resolveWebhookProductId(productId);
      await fetch(PARSE_REFERENCE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: webhookPid, material_type: materials[0]?.material_type || "orientation", content_text: text, process_types: ALL_PROCESS_TYPES }),
      });
      // Retry sync
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(r => setTimeout(r, 10000 + attempt * 5000));
        try { await syncRulesToLocalDb(productId); break; } catch { /* retry */ }
      }
    } catch (err) {
      console.error("[copy rule gen]", err);
    }
  };

  const handleCopy = async () => {
    if (selectedIds.length === 0) return;
    setCopying(true);

    try {
      let copiedCount = 0;
      for (const targetProductId of selectedIds) {
        for (const mat of materials) {
          const payload = {
            scope_type: "product",
            scope_id: targetProductId,
            material_type: mat.material_type,
            title: mat.title,
            content_text: mat.content_text || null,
            file_name: mat.file_name || null,
            file_data: mat.file_data || null,
            source_url: mat.source_url || null,
            source_type: mat.source_type,
            is_active: true,
            sort_order: 0,
            created_by: user?.email || user?.id || null,
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabase.from("reference_materials").insert(payload);
          if (!error) copiedCount++;
        }
      }

      toast({ title: "コピー完了", description: `${selectedIds.length}商材に${copiedCount}件の資料をコピーしました` });
      onOpenChange(false);

      // Background rule generation
      if (autoGenerateRules) {
        const combinedText = materials.map(m => m.content_text).filter(Boolean).join("\n\n");
        if (combinedText) {
          toast({ title: "AIルール生成中...", description: "バックグラウンドでチェックルールを生成しています" });
          for (const targetProductId of selectedIds) {
            triggerRuleGenerationForProduct(targetProductId, combinedText).catch(console.error);
          }
        }
      }
    } catch (err) {
      toast({ title: "コピーに失敗しました", variant: "destructive" });
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Copy className="h-4 w-4" />
            参考資料を他商材にコピー
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              コピーする資料: <strong>{materials.length}件</strong>
              {materials.length === 1 && ` — ${materials[0].title}`}
            </p>
          </div>

          {/* Product selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">コピー先の商材を選択</label>
              <Button size="sm" variant="ghost" className="text-[10px] h-5 px-1" onClick={selectAll}>
                {selectedIds.length === products.length ? "全解除" : "全選択"}
              </Button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
              {products.length === 0 && (
                <p className="text-xs text-muted-foreground/60 italic py-2 text-center">他の商材がありません</p>
              )}
              {products.map(p => (
                <label key={p.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                  <span className="text-xs flex-1">{p.name}</span>
                  {p.label && <Badge variant="outline" className="text-[9px] h-4">{p.label}</Badge>}
                </label>
              ))}
            </div>
          </div>

          {/* Auto generate rules toggle */}
          <div className="flex items-center gap-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1">
              <Label htmlFor="copy-auto-rules" className="text-xs font-medium cursor-pointer">チェックルールも自動生成する</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">ONにすると、コピー先商材にもAIがチェックルールを生成します</p>
            </div>
            <Switch id="copy-auto-rules" checked={autoGenerateRules} onCheckedChange={setAutoGenerateRules} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button size="sm" className="text-xs h-8" onClick={handleCopy} disabled={copying || selectedIds.length === 0}>
              {copying ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />コピー中...</> : `${selectedIds.length}商材にコピー`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
