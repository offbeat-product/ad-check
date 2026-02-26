import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Client, Product } from "@/lib/db-types";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

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
  const [client, setClient] = useState<Client | null>(null);
  const [products, setProducts] = useState<ProductWithStats[]>([]);
  const [loading, setLoading] = useState(true);

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
      // Fetch project counts and latest check dates per product
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

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">読み込み中...</div>;
  if (!client) return <div className="flex items-center justify-center h-64 text-muted-foreground">クライアントが見つかりません</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold">{client.name}</h1>
      </div>

      <h2 className="text-sm font-medium text-muted-foreground mb-4">商材一覧</h2>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 italic">商材が登録されていません</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => navigate(`/product/${product.id}`)}
              className="glass-card p-5 text-left hover:border-primary/30 transition-colors"
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
          ))}
        </div>
      )}
    </div>
  );
}
