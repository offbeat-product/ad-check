import type { ProductCode, ProcessType } from "@/lib/types";

interface ContextBarProps {
  client: string;
  productName: string;
  processLabel: string;
}

export default function ContextBar({ client, productName, processLabel }: ContextBarProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      <ContextChip label="CLIENT" value={client} colorClass="bg-context-client/15 text-context-client border-context-client/30" />
      <ContextChip label="PRODUCT" value={productName} colorClass="bg-context-product/15 text-context-product border-context-product/30" />
      <ContextChip label="PROCESS" value={processLabel} colorClass="bg-context-process/15 text-context-process border-context-process/30" />
    </div>
  );
}

function ContextChip({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium ${colorClass}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span>
      <span>{value}</span>
    </div>
  );
}
