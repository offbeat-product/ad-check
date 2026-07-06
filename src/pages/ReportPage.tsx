import { BarChart3 } from "lucide-react";
import { CaseProcessDetailReport } from "@/components/report/CaseProcessDetailReport";

export default function ReportPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">制作進捗・品質</h1>
        </div>
      </header>

      <main className="px-6 py-6 max-w-[1600px] mx-auto">
        <CaseProcessDetailReport />
      </main>
    </div>
  );
}
