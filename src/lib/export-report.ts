/** Export report data as Excel or PDF */

interface BreakdownRow {
  name: string;
  deadlineRate: number | null;
  deadlineTotal: number;
  draft1Rate: number | null;
  draft1Total: number;
  draft2Rate: number | null;
  draft2Total: number;
  draft3Rate: number | null;
  draft3Total: number;
}

interface MonthlyRow {
  monthLabel: string;
  deadlineRate: number | null;
  deadlineTotal: number;
  firstDraftRate: number | null;
  draft1Total: number;
  secondDraftRate: number | null;
  draft2Total: number;
  thirdDraftRate: number | null;
  draft3Total: number;
}

interface ReportExportData {
  viewMode: string;
  monthlyData: MonthlyRow[];
  breakdownData: BreakdownRow[];
  breakdownTitle: string;
  targets: { deadline: number; first: number; second: number; third: number };
  exportDate: string;
}

export async function exportReportExcel(data: ReportExportData, filename: string) {
  const XLSX = await import("@e965/xlsx");

  const summaryData = [
    ["CheckGo AI レポート"],
    [],
    ["エクスポート日時", data.exportDate],
    ["表示モード", data.viewMode],
    [],
    ["目標値"],
    ["納期遵守率", `${data.targets.deadline}%`],
    ["初稿合格率", `${data.targets.first}%`],
    ["第2稿合格率", `${data.targets.second}%`],
    ["第3稿合格率", `${data.targets.third}%`],
  ];

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "サマリ");

  // Monthly sheet
  if (data.monthlyData.length > 0) {
    const monthlyHeader = ["月", "納期遵守率", "件数", "初稿合格率", "件数", "第2稿合格率", "件数", "第3稿合格率", "件数"];
    const monthlyRows = data.monthlyData.map((d) => [
      d.monthLabel,
      d.deadlineRate !== null ? `${d.deadlineRate}%` : "—",
      d.deadlineTotal,
      d.firstDraftRate !== null ? `${d.firstDraftRate}%` : "—",
      d.draft1Total,
      d.secondDraftRate !== null ? `${d.secondDraftRate}%` : "—",
      d.draft2Total,
      d.thirdDraftRate !== null ? `${d.thirdDraftRate}%` : "—",
      d.draft3Total,
    ]);
    const wsMonthly = XLSX.utils.aoa_to_sheet([monthlyHeader, ...monthlyRows]);
    wsMonthly["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, wsMonthly, "月別推移");
  }

  // Breakdown sheet
  if (data.breakdownData.length > 0) {
    const bdHeader = ["名称", "納期遵守率", "件数", "初稿合格率", "件数", "第2稿合格率", "件数", "第3稿合格率", "件数"];
    const bdRows = data.breakdownData.map((r) => [
      r.name,
      r.deadlineRate !== null ? `${r.deadlineRate}%` : "—",
      r.deadlineTotal,
      r.draft1Rate !== null ? `${r.draft1Rate}%` : "—",
      r.draft1Total,
      r.draft2Rate !== null ? `${r.draft2Rate}%` : "—",
      r.draft2Total,
      r.draft3Rate !== null ? `${r.draft3Rate}%` : "—",
      r.draft3Total,
    ]);
    const wsBd = XLSX.utils.aoa_to_sheet([bdHeader, ...bdRows]);
    wsBd["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, wsBd, data.breakdownTitle);
  }

  XLSX.writeFile(wb, filename);
}

export function exportReportPdf(data: ReportExportData) {
  // Generate a print-friendly HTML and open in a new window for PDF printing
  const styles = `
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #1a1a1a; font-size: 12px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      h2 { font-size: 14px; margin-top: 24px; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
      .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: right; }
      th { background: #f5f5f5; font-weight: 600; text-align: center; }
      td:first-child, th:first-child { text-align: left; }
      .target-row td { background: #f9f9f9; font-style: italic; color: #666; }
      @media print { body { padding: 20px; } }
    </style>
  `;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CheckGo AI レポート</title>${styles}</head><body>`;
  html += `<h1>CheckGo AI レポート</h1>`;
  html += `<p class="meta">エクスポート日時: ${data.exportDate} ｜ 表示: ${data.viewMode}</p>`;

  // Targets
  html += `<h2>目標値</h2><table><tr><th>指標</th><th>目標</th></tr>`;
  html += `<tr><td>納期遵守率</td><td>${data.targets.deadline}%</td></tr>`;
  html += `<tr><td>初稿合格率</td><td>${data.targets.first}%</td></tr>`;
  html += `<tr><td>第2稿合格率</td><td>${data.targets.second}%</td></tr>`;
  html += `<tr><td>第3稿合格率</td><td>${data.targets.third}%</td></tr></table>`;

  const fmtRate = (r: number | null) => r !== null ? `${r}%` : "—";

  // Monthly
  if (data.monthlyData.length > 0) {
    html += `<h2>月別推移</h2><table>`;
    html += `<tr><th>月</th><th>納期遵守率</th><th>件数</th><th>初稿合格率</th><th>件数</th><th>第2稿合格率</th><th>件数</th><th>第3稿合格率</th><th>件数</th></tr>`;
    data.monthlyData.forEach((d) => {
      html += `<tr><td>${d.monthLabel}</td><td>${fmtRate(d.deadlineRate)}</td><td>${d.deadlineTotal}</td><td>${fmtRate(d.firstDraftRate)}</td><td>${d.draft1Total}</td><td>${fmtRate(d.secondDraftRate)}</td><td>${d.draft2Total}</td><td>${fmtRate(d.thirdDraftRate)}</td><td>${d.draft3Total}</td></tr>`;
    });
    html += `</table>`;
  }

  // Breakdown
  if (data.breakdownData.length > 0) {
    html += `<h2>${data.breakdownTitle}</h2><table>`;
    html += `<tr><th>名称</th><th>納期遵守率</th><th>件数</th><th>初稿合格率</th><th>件数</th><th>第2稿合格率</th><th>件数</th><th>第3稿合格率</th><th>件数</th></tr>`;
    data.breakdownData.forEach((r) => {
      html += `<tr><td>${r.name}</td><td>${fmtRate(r.deadlineRate)}</td><td>${r.deadlineTotal}</td><td>${fmtRate(r.draft1Rate)}</td><td>${r.draft1Total}</td><td>${fmtRate(r.draft2Rate)}</td><td>${r.draft2Total}</td><td>${fmtRate(r.draft3Rate)}</td><td>${r.draft3Total}</td></tr>`;
    });
    html += `</table>`;
  }

  html += `</body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }
}
