import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Client, Product } from "@/lib/db-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Pencil, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProductWithStats extends Product {
  projectCount: number;
  latestCheckDate: string | null;
}

const productColorMap: Record<string, string> = {
  "product-ltr": "hsl(193, 100%, 50%)",
  "product-cta": "hsl(264, 100%, 58%)",
  "product-tmd": "hsl(166, 100%, 39%)",
};

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [client, setClient] = useState<Client | null>(null);
  const [products, setProducts] = useState<ProductWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      const [clientRes, productsRes] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
        supabase.from("products").select("*").eq("client_id", id).order("name"),
      ]);

      if (cancelled) return;
      handleSupabaseError(clientRes.error, "client");
      handleSupabaseError(productsRes.error, "products");
      setClient(clientRes.data);

      const prods = productsRes.data ?? [];
      const enriched: ProductWithStats[] = await Promise.all(
        prods.map(async (p) => {
          const { count } = await supabase
            .from("projects")
            .select("*", { count: "exact", head: true })
            .eq("product_id", p.id);

          const { data: latestCheck } = await supabase
            .from("check_results")
            .select("created_at")
            .eq("product_code", p.code)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...p,
            projectCount: count ?? 0,
            latestCheckDate: latestCheck?.created_at ?? null,
          };
        })
      );

      setProducts(enriched);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [id]);

  const handleRenameClient = async () => {
    if (!client || !editName.trim()) return;
    const { error } = await supabase.from("clients").update({ name: editName.trim() }).eq("id", client.id);
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      setClient({ ...client, name: editName.trim() });
      toast({ title: "クライアント名を更新しました" });
    }
    setEditing(false);
  };

  const handleDeleteClient = async () => {
    if (!client) return;
    // Check if there are products under this client
    if (products.length > 0) {
      toast({ title: "削除できません", description: "先に配下の商材を全て削除してください。", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      toast({ title: "削除エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "クライアントを削除しました" });
      navigate("/dashboard");
    }
  };

  const handleDeleteProduct = async (product: ProductWithStats) => {
    if (product.projectCount > 0) {
      toast({ title: "削除できません", description: "先に配下の案件を全て削除してください。", variant: "destructive" });
      return;
    }
    // Delete related data
    await Promise.all([
      supabase.from("check_rules").delete().eq("product_id", product.id),
      supabase.from("reference_materials").delete().eq("scope_id", product.id),
    ]);
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      toast({ title: "削除エラー", description: error.message, variant: "destructive" });
    } else {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      toast({ title: `「${product.name}」を削除しました` });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">読み込み中...</div>;
  if (!client) return <div className="flex items-center justify-center h-64 text-muted-foreground">クライアントが見つかりません</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-8 text-lg font-bold w-64"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameClient(); if (e.key === "Escape") setEditing(false); }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRenameClient}>
              <Check className="h-4 w-4 text-status-ok" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{client.name}</h1>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setEditName(client.name); setEditing(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>クライアントを削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    「{client.name}」を削除します。{products.length > 0 ? "配下に商材があるため、先に商材を削除してください。" : "この操作は元に戻せません。"}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteClient}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={products.length > 0}
                  >
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <h2 className="text-sm font-medium text-muted-foreground mb-4">商材一覧</h2>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 italic">商材が登録されていません</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div key={product.id} className="glass-card p-5 text-left hover:border-primary/30 transition-colors relative group">
              <button
                onClick={() => navigate(`/product/${product.id}`)}
                className="w-full text-left"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: productColorMap[product.color || ""] || "hsl(193, 100%, 50%)" }}
                  />
                  <span className="font-semibold text-sm">{product.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    案件 {product.projectCount}件
                  </Badge>
                  <span>
                    {product.latestCheckDate
                      ? `最終チェック: ${new Date(product.latestCheckDate).toLocaleDateString("ja-JP")}`
                      : "チェック未実施"}
                  </span>
                </div>
                {product.meta && (
                  <p className="text-[11px] text-muted-foreground/60 mt-2">{product.meta}</p>
                )}
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>商材を削除</AlertDialogTitle>
                    <AlertDialogDescription>
                      「{product.name}」を削除します。{product.projectCount > 0 ? `配下に${product.projectCount}件の案件があるため、先に案件を削除してください。` : "関連するチェックルールと参考資料も削除されます。"}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteProduct(product)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={product.projectCount > 0}
                    >
                      削除する
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
