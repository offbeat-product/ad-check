import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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

  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
    ]).then(([cRes, pRes]) => {
      handleSupabaseError(cRes.error, "clients");
      handleSupabaseError(pRes.error, "products");
      const clientData = cRes.data ?? [];
      setClients(clientData);
      setProducts(pRes.data ?? []);
      // Auto-select if only one client
      if (clientData.length === 1 && !clientId) setClientId(clientData[0].id);
    });
  }, [open]);

  const filteredProducts = products.filter((p) => p.client_id === clientId);

  const handleCreate = async () => {
    if (!name.trim() || !productId || !user) return;
    setLoading(true);
    const { data, error } = await supabase.from("projects").insert({
      product_id: productId,
      name: name.trim(),
      project_code: code.trim() || null,
      description: description.trim() || null,
      created_by: user.id,
    }).select("id").single();

    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else if (data) {
      toast({ title: "案件を作成しました" });
      onCreated(data.id);
      onOpenChange(false);
      setName(""); setCode(""); setDescription("");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>新規案件作成</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">クライアント</label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setProductId(""); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="選択..." /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">商材</label>
            <Select value={productId} onValueChange={setProductId} disabled={!clientId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="選択..." /></SelectTrigger>
              <SelectContent>
                {filteredProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
