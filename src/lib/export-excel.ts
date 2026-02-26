import type { CheckItem } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/check-display";

/** Export check items as an Excel (.xlsx) file */
export async function exportCheckExcel(
  items: CheckItem[],
  meta: { productName: string; processType: string; overallStatus: string; date: string },
  filename: string
) {
  const XLSX = await import("@e965/xlsx");

  // Summary sheet data
  const summaryData = [
    ["CheckGo AI チェックレポート"],
    [],
    ["商材名", meta.productName],
    ["工程", meta.processType],
    ["総合判定", meta.overallStatus],
    ["チェック日時", meta.date],
    [],
    ["修正必須(NG)", items.filter((i) => i.status === "NG").length],
    ["要確認(WARNING)", items.filter((i) => i.status === "WARNING").length],
    ["問題なし(OK)", items.filter((i) => i.status === "OK").length],
    ["手動確認(MANUAL)", items.filter((i) => (i.status as string) === "MANUAL").length],
    ["合計", items.length],
  ];

  // Detail sheet data
  const detailHeader = ["No.", "パターンID", "チェック項目", "ステータス", "重要度", "該当箇所", "詳細", "修正提案"];
  const detailRows = items.map((item, i) => [
    i + 1,
    item.pattern_id,
    item.item,
    STATUS_LABEL[item.status] || item.status,
    item.severity === "high" ? "高" : item.severity === "medium" ? "中" : "低",
    item.location || "",
    item.detail,
    item.suggestion || "",
  ]);

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "サマリ");

  // Detail sheet
  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
  wsDetail["!cols"] = [
    { wch: 5 },   // No.
    { wch: 14 },  // パターンID
    { wch: 30 },  // チェック項目
    { wch: 10 },  // ステータス
    { wch: 8 },   // 重要度
    { wch: 20 },  // 該当箇所
    { wch: 50 },  // 詳細
    { wch: 40 },  // 修正提案
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "チェック結果");

  // Download
  XLSX.writeFile(wb, filename);
}
