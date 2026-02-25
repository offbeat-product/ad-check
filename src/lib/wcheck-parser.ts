/**
 * W-Check Sheet Excel parser
 * Parses uploaded .xlsx files to extract check items organized by process.
 */

export interface WCheckItem {
  number: number;
  category: string;
  item: string;
  shortLabel: string;
}

export interface WCheckSheetData {
  sheetName: string;
  processKeys: string[];
  label: string;
  items: WCheckItem[];
  itemCount: number;
}

export type WCheckParsedData = Record<string, WCheckSheetData>;

const SHEET_TO_PROCESS: Record<string, { process_keys: string[]; label: string }> = {
  '0_BGMNA':      { process_keys: ['narration', 'bgm'], label: 'BGM・ナレーション' },
  '1_字コンテNA':  { process_keys: ['script', 'na_script'], label: '字コンテ・NA原稿' },
  '2_Vコン':       { process_keys: ['vcon'], label: 'Vコン' },
  '3_SF':          { process_keys: ['styleframe'], label: 'スタイルフレーム' },
  '4_絵コンテ':    { process_keys: ['storyboard'], label: '絵コンテ' },
  '5_横マスター':  { process_keys: ['video_horizontal'], label: '横動画マスター' },
  '6_横全展開':    { process_keys: ['video_horizontal'], label: '横動画全展開' },
  '7_縦マスター':  { process_keys: ['video_vertical'], label: '縦動画マスター' },
  '8_縦全展開':    { process_keys: ['video_vertical'], label: '縦動画全展開' },
  '9_最終納品':    { process_keys: ['final_delivery'], label: '最終納品' },
};

const JSON_SEPARATOR = '---PARSED_JSON---';

function fuzzyMatchSheet(sheetName: string): string | null {
  // Try exact/includes match first
  for (const key of Object.keys(SHEET_TO_PROCESS)) {
    if (sheetName.includes(key) || sheetName === key) return key;
  }

  // Fuzzy matching
  const nameLC = sheetName.toLowerCase();
  if (nameLC.includes('bgm') || nameLC.includes('na')) return '0_BGMNA';
  if (nameLC.includes('字コンテ') || nameLC.includes('コンテna')) return '1_字コンテNA';
  if (nameLC.includes('vコン') || nameLC.includes('ビデオコンテ')) return '2_Vコン';
  if (nameLC.includes('sf') || nameLC.includes('スタイルフレーム')) return '3_SF';
  if (nameLC.includes('絵コンテ')) return '4_絵コンテ';
  if (nameLC.includes('横') && nameLC.includes('マスター')) return '5_横マスター';
  if (nameLC.includes('横') && nameLC.includes('展開')) return '6_横全展開';
  if (nameLC.includes('縦') && nameLC.includes('マスター')) return '7_縦マスター';
  if (nameLC.includes('縦') && nameLC.includes('展開')) return '8_縦全展開';
  if (nameLC.includes('最終') || nameLC.includes('納品')) return '9_最終納品';
  return null;
}

export async function parseWCheckFile(file: File): Promise<WCheckParsedData> {
  const XLSX = await import("@e965/xlsx");
  const data = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(data), { type: "array" });
  return parseWCheckWorkbook(wb, XLSX);
}

export function parseWCheckFromBase64(base64Data: string): Promise<WCheckParsedData> {
  return new Promise(async (resolve, reject) => {
    try {
      const XLSX = await import("@e965/xlsx");
      // Remove data URI prefix if present
      const raw = base64Data.replace(/^data:[^;]+;base64,/, "");
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const wb = XLSX.read(bytes, { type: "array" });
      resolve(parseWCheckWorkbook(wb, XLSX));
    } catch (err) {
      reject(err);
    }
  });
}

function parseWCheckWorkbook(wb: any, XLSX: any): WCheckParsedData {
  const parsedData: WCheckParsedData = {};

  for (const sheetName of wb.SheetNames) {
    if (sheetName.startsWith('CL_') || sheetName === '使い方') continue;

    const matchedKey = fuzzyMatchSheet(sheetName);
    if (!matchedKey) continue;

    const ws = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 'A', defval: '' });

    const checkItems: WCheckItem[] = [];
    let currentCategory = '';

    for (const row of jsonData) {
      const colA = String(row.A || '').trim();
      const colB = String(row.B || '').trim();
      const colC = String(row.C || '').trim();

      if (colA.startsWith('▌') || colB.startsWith('▌') || colC.startsWith('▌')) {
        currentCategory = (colA + colB + colC).replace(/▌/g, '').trim();
        continue;
      }

      const itemNumber = parseFloat(colA);
      if (!isNaN(itemNumber) && colC) {
        checkItems.push({
          number: itemNumber,
          category: currentCategory || colB,
          item: colC,
          shortLabel: colB || currentCategory,
        });
      }
    }

    if (checkItems.length > 0) {
      const config = SHEET_TO_PROCESS[matchedKey];
      parsedData[matchedKey] = {
        sheetName,
        processKeys: config.process_keys,
        label: config.label,
        items: checkItems,
        itemCount: checkItems.length,
      };
    }
  }

  return parsedData;
}

export function generateWCheckContentText(parsedData: WCheckParsedData): string {
  let text = '【Wチェックシート — 工程別チェック項目】\n\n';

  for (const [, data] of Object.entries(parsedData).sort(([a], [b]) => a.localeCompare(b))) {
    text += `=== ${data.label}（${data.sheetName}）===\n`;
    let lastCat = '';
    for (const item of data.items) {
      if (item.category !== lastCat) {
        text += `\n▌${item.category}\n`;
        lastCat = item.category;
      }
      text += `${item.number}. [${item.shortLabel}] ${item.item}\n`;
    }
    text += '\n';
  }

  return text;
}

/** Combine human-readable text and parsed JSON into content_text for storage */
export function buildWCheckContentText(parsedData: WCheckParsedData): string {
  const text = generateWCheckContentText(parsedData);
  return text + '\n' + JSON_SEPARATOR + '\n' + JSON.stringify(parsedData);
}

/** Extract only the human-readable portion (for AI prompt injection) */
export function getWCheckTextForAI(contentText: string): string {
  if (contentText.includes(JSON_SEPARATOR)) {
    return contentText.split(JSON_SEPARATOR)[0].trim();
  }
  return contentText;
}

/** Extract parsed JSON from content_text (for UI display) */
export function getWCheckParsedJson(contentText: string): WCheckParsedData | null {
  if (!contentText.includes(JSON_SEPARATOR)) return null;
  try {
    const jsonPart = contentText.split(JSON_SEPARATOR)[1].trim();
    return JSON.parse(jsonPart);
  } catch {
    return null;
  }
}

/** Extract W-check items relevant to a specific process key */
export function extractWCheckForProcess(contentText: string, processKey: string): string {
  const parsed = getWCheckParsedJson(contentText);
  if (!parsed) {
    // No parsed data, return full text (minus JSON part)
    return getWCheckTextForAI(contentText);
  }

  let relevantItems = '';
  for (const [, data] of Object.entries(parsed)) {
    if (data.processKeys && data.processKeys.includes(processKey)) {
      relevantItems += `\n【${data.label}チェック項目】\n`;
      let lastCat = '';
      for (const item of data.items) {
        if (item.category !== lastCat) {
          relevantItems += `▌${item.category}\n`;
          lastCat = item.category;
        }
        relevantItems += `${item.number}. [${item.shortLabel}] ${item.item}\n`;
      }
    }
  }

  return relevantItems || getWCheckTextForAI(contentText);
}

/** Get total item count from parsed data */
export function getWCheckTotalCount(parsedData: WCheckParsedData): number {
  return Object.values(parsedData).reduce((sum, d) => sum + d.itemCount, 0);
}
