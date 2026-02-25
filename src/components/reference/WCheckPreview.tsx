import { type WCheckParsedData, getWCheckTotalCount } from "@/lib/wcheck-parser";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2 } from "lucide-react";

interface Props {
  parsedData: WCheckParsedData;
}

export default function WCheckPreview({ parsedData }: Props) {
  const entries = Object.entries(parsedData).sort(([a], [b]) => a.localeCompare(b));
  const totalCount = getWCheckTotalCount(parsedData);

  if (entries.length === 0) return null;

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="h-4 w-4 text-status-ok" />
        Wチェックシートを解析しました
      </div>

      <div className="text-xs font-medium text-muted-foreground">📊 解析結果:</div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs h-8">工程</TableHead>
            <TableHead className="text-xs h-8 text-right">チェック項目数</TableHead>
            <TableHead className="text-xs h-8">ステータス</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([key, data]) => (
            <TableRow key={key}>
              <TableCell className="text-xs py-1.5">{data.label}</TableCell>
              <TableCell className="text-xs py-1.5 text-right">{data.itemCount}項目</TableCell>
              <TableCell className="text-xs py-1.5">
                <span className="text-status-ok">✅ 抽出成功</span>
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2">
            <TableCell className="text-xs py-1.5 font-semibold">合計</TableCell>
            <TableCell className="text-xs py-1.5 text-right font-semibold">{totalCount}項目</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>

      <Accordion type="single" collapsible className="w-full">
        {entries.map(([key, data]) => (
          <AccordionItem key={key} value={key} className="border-border">
            <AccordionTrigger className="text-xs py-2 hover:no-underline">
              {data.label} ({data.itemCount}項目)
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-0.5 text-xs font-mono bg-muted/30 rounded p-2 max-h-48 overflow-y-auto">
                {(() => {
                  let lastCat = '';
                  return data.items.map((item, i) => {
                    const showCat = item.category !== lastCat;
                    lastCat = item.category;
                    return (
                      <div key={i}>
                        {showCat && (
                          <div className="font-semibold text-primary mt-1.5 mb-0.5">▌{item.category}</div>
                        )}
                        <div className="pl-2 text-muted-foreground">
                          {item.number}. [{item.shortLabel}] {item.item}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <p className="text-[10px] text-amber-600">
        ⚠️ 抽出結果を確認し、問題なければ保存してください。テキストエリアで手動修正も可能です。
      </p>
    </div>
  );
}
