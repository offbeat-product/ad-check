import { useState } from "react";
import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import type { ProductCode } from "@/lib/types";

export type AppLayoutContext = {
  selectedProduct: ProductCode | null;
  setSelectedProduct: (code: ProductCode) => void;
};

export default function AppLayout() {
  const [selectedProduct, setSelectedProduct] = useState<ProductCode | null>(null);

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar onProductSelect={(code) => setSelectedProduct(code)} />
      <main className="flex-1 overflow-auto">
        <Outlet context={{ selectedProduct, setSelectedProduct } satisfies AppLayoutContext} />
      </main>
    </div>
  );
}
