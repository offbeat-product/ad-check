import type { CheckItem } from "./types";

interface MarkerPosition {
  x: number;
  y: number;
}

const locationKeywords: [string, MarkerPosition][] = [
  ["薬剤", { x: 75, y: 55 }],
  ["錠剤", { x: 75, y: 55 }],
  ["カプセル", { x: 75, y: 55 }],
  ["手のひら", { x: 75, y: 55 }],
  ["1カット目", { x: 20, y: 30 }],
  ["2カット目", { x: 20, y: 55 }],
  ["3カット目", { x: 20, y: 80 }],
  ["4カット目", { x: 20, y: 90 }],
  ["メインテキスト", { x: 45, y: 40 }],
  ["テキスト", { x: 45, y: 45 }],
  ["見出し", { x: 45, y: 25 }],
  ["人物写真", { x: 35, y: 50 }],
  ["人物", { x: 35, y: 50 }],
  ["ロゴ", { x: 85, y: 10 }],
  ["ブランド", { x: 85, y: 10 }],
  ["配色", { x: 90, y: 15 }],
  ["カラー", { x: 90, y: 15 }],
  ["数値", { x: 50, y: 75 }],
  ["注釈", { x: 50, y: 88 }],
  ["ウォーターマーク", { x: 90, y: 90 }],
  ["素材", { x: 50, y: 50 }],
  ["背景", { x: 90, y: 85 }],
  ["冒頭", { x: 15, y: 15 }],
  ["前半", { x: 15, y: 35 }],
  ["中盤", { x: 15, y: 55 }],
  ["後半", { x: 15, y: 75 }],
  ["締め", { x: 15, y: 90 }],
  ["CTA", { x: 50, y: 90 }],
];

// These keywords get index-based vertical offset
const indexOffsetKeywords = ["全体", "全カット", "全画面"];

export function getMarkerPosition(location: string | undefined, index: number, total: number): MarkerPosition {
  if (!location) {
    return { x: 92, y: 10 + (index * Math.min(12, 80 / Math.max(total, 1))) };
  }

  const clean = location.replace(/^📍\s*/, "");

  // Check index-offset keywords first
  for (const keyword of indexOffsetKeywords) {
    if (clean.includes(keyword)) {
      return { x: 8, y: 15 + (index * 12) };
    }
  }

  for (const [keyword, pos] of locationKeywords) {
    if (clean.includes(keyword)) {
      // Small offset for same-keyword items to avoid overlap
      return { x: pos.x + (index % 3) * 4, y: pos.y + (index % 3) * 4 };
    }
  }

  return { x: 92, y: 10 + (index * Math.min(12, 80 / Math.max(total, 1))) };
}

export interface CheckMarker {
  item: CheckItem;
  position: MarkerPosition;
  number: number;
}

export function getCheckMarkers(items: CheckItem[]): CheckMarker[] {
  // NG items first, then WARNING — numbered sequentially
  const ng = items.filter((i) => i.status === "NG");
  const warn = items.filter((i) => i.status === "WARNING");
  const ngWarn = [...ng, ...warn];
  return ngWarn.map((item, i) => ({
    item,
    position: getMarkerPosition(item.location, i, ngWarn.length),
    number: i + 1,
  }));
}
