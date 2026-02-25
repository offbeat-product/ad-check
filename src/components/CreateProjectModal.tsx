import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { DEFAULT_PROCESSES } from "@/lib/process-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import type { Client, Product } from "@/lib/db-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (projectId: string) => void;
}

export default function CreateProjectModal({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clientId, setClientId] = useState("");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCode, setNewProductCode] = useState("");
  const [newProductLabel, setNewProductLabel] = useState("");
  const [creatingProduct, setCreatingProduct] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
    ]).then(([cRes, pRes]) => {
      if (cancelled) return;
      handleSupabaseError(cRes.error, "clients");
      handleSupabaseError(pRes.error, "products");
      const clientData = cRes.data ?? [];
      setClients(clientData);
      setProducts(pRes.data ?? []);
      if (clientData.length === 1 && !clientId) setClientId(clientData[0].id);
    });
    return () => { cancelled = true; };
  }, [open]);

  const filteredProducts = products.filter((p) => p.client_id === clientId);

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    setCreatingClient(true);
    const { data, error } = await supabase.from("clients").insert({ name: newClientName.trim() }).select("*").single();
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else if (data) {
      setClients((prev) => [...prev, data]);
      setClientId(data.id);
      setProductId("");
      setShowNewClient(false);
      setNewClientName("");
      toast({ title: "クライアントを追加しました" });
    }
    setCreatingClient(false);
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim() || !newProductCode.trim() || !clientId) return;
    setCreatingProduct(true);
    const { data, error } = await supabase.from("products").insert({
      name: newProductName.trim(),
      code: newProductCode.trim().toLowerCase(),
      label: newProductLabel.trim() || newProductName.trim(),
      client_id: clientId,
    }).select("*").single();
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else if (data) {
      setProducts((prev) => [...prev, data]);
      setProductId(data.id);
      setShowNewProduct(false);
      setNewProductName("");
      setNewProductCode("");
      setNewProductLabel("");
      toast({ title: "商材を追加しました" });
    }
    setCreatingProduct(false);
  };

  const handleCreate = async () => {
    if (!name.trim() || !productId || !user) return;
    setLoading(true);
    const { data, error } = await supabase.from("projects").insert({
      product_id: productId,
      name: name.trim(),
      project_code: code.trim() || null,
      description: description.trim() || null,
      created_by: user.id,
      status: "preparing",
    }).select("id").single();

    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else if (data) {
      // Auto-create default processes
      const processInserts = DEFAULT_PROCESSES.map((p) => ({
        project_id: data.id,
        ...p,
      }));
      const { error: procErr } = await supabase.from("project_processes").insert(processInserts);
      handleSupabaseError(procErr, "default processes");

      toast({ title: "案件を作成しました" });
      onCreated(data.id);
      onOpenChange(false);
      setName(""); setCode(""); setDescription("");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>新規案件作成</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Client selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">クライアント</label>
            {!showNewClient ? (
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setProductId(""); setShowNewProduct(false); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  <Separator className="my-1" />
                  <button
                    className="w-full text-left px-2 py-1.5 text-sm text-primary hover:bg-muted rounded-sm flex items-center gap-1.5"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowNewClient(true); }}
                  >
                    <Plus className="h-3.5 w-3.5" />新しいクライアントを追加
                  </button>
                </SelectContent>
              </Select>
            ) : (
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="クライアント名" className="h-8 text-sm" autoFocus />
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs h-7" onClick={handleCreateClient} disabled={creatingClient || !newClientName.trim()}>
                    {creatingClient ? "追加中..." : "追加"}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setShowNewClient(false); setNewClientName(""); }}>キャンセル</Button>
                </div>
              </div>
            )}
          </div>

          {/* Product selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">商材</label>
            {!showNewProduct ? (
              <Select value={productId} onValueChange={setProductId} disabled={!clientId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>
                  {filteredProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  {clientId && (
                    <>
                      <Separator className="my-1" />
                      <button
                        className="w-full text-left px-2 py-1.5 text-sm text-primary hover:bg-muted rounded-sm flex items-center gap-1.5"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowNewProduct(true); }}
                      >
                        <Plus className="h-3.5 w-3.5" />新しい商材を追加
                      </button>
                    </>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                <Input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="商材名 *" className="h-8 text-sm" autoFocus />
                <Input value={newProductCode} onChange={(e) => setNewProductCode(e.target.value)} placeholder="商材コード * (例: ltr_expo)" className="h-8 text-sm" />
                <Input value={newProductLabel} onChange={(e) => setNewProductLabel(e.target.value)} placeholder="表示ラベル（任意）" className="h-8 text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs h-7" onClick={handleCreateProduct} disabled={creatingProduct || !newProductName.trim() || !newProductCode.trim()}>
                    {creatingProduct ? "追加中..." : "追加"}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setShowNewProduct(false); setNewProductName(""); setNewProductCode(""); setNewProductLabel(""); }}>キャンセル</Button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">案件名</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="001_EXPO_20250214_広告用動画" className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">案件コード（任意）</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LTR-001" className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">説明（任意）</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px] text-sm" />
          </div>
          <Button onClick={handleCreate} disabled={loading || !name.trim() || !productId} className="w-full">
            {loading ? "作成中..." : "作成"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
