import type { CheckItem } from "./types";

interface MarkerPosition {
  x: number;
  y: number;
}

const locationMap: Record<string, MarkerPosition> = {
  "全体": { x: 8, y: 15 },
  "全カット": { x: 8, y: 15 },
  "全画面": { x: 8, y: 15 },
  "1カット目": { x: 15, y: 25 },
  "2カット目": { x: 15, y: 50 },
  "3カット目": { x: 15, y: 75 },
  "4カット目": { x: 15, y: 90 },
  "メインテキスト": { x: 50, y: 40 },
  "テキスト": { x: 50, y: 45 },
  "見出し": { x: 50, y: 30 },
  "背景": { x: 85, y: 85 },
  "人物": { x: 30, y: 50 },
  "人物写真": { x: 30, y: 50 },
  "薬剤": { x: 70, y: 60 },
  "カラー": { x: 85, y: 15 },
  "配色": { x: 85, y: 15 },
  "ロゴ": { x: 85, y: 10 },
  "ブランド": { x: 85, y: 10 },
  "数値": { x: 50, y: 70 },
  "注釈": { x: 50, y: 85 },
  "ウォーターマーク": { x: 90, y: 90 },
  "素材": { x: 50, y: 50 },
  "冒頭": { x: 15, y: 15 },
  "前半": { x: 15, y: 35 },
  "中盤": { x: 15, y: 55 },
  "後半": { x: 15, y: 75 },
  "締め": { x: 15, y: 90 },
  "CTA": { x: 50, y: 90 },
};

export function getMarkerPosition(location: string | undefined, index: number, total: number): MarkerPosition {
  if (!location) {
    return { x: 92, y: 10 + (index * (80 / Math.max(total, 1))) };
  }

  // Remove 📍 prefix
  const clean = location.replace(/^📍\s*/, "");

  for (const [keyword, pos] of Object.entries(locationMap)) {
    if (clean.includes(keyword)) {
      // Offset slightly for same-keyword items
      return { x: pos.x + (index % 3) * 4, y: pos.y + (index % 3) * 4 };
    }
  }

  return { x: 92, y: 10 + (index * (80 / Math.max(total, 1))) };
}

export interface CheckMarker {
  item: CheckItem;
  position: MarkerPosition;
  number: number;
}

export function getCheckMarkers(items: CheckItem[]): CheckMarker[] {
  const ngWarn = items.filter((i) => i.status === "NG" || i.status === "WARNING");
  return ngWarn.map((item, i) => ({
    item,
    position: getMarkerPosition(item.location, i, ngWarn.length),
    number: i + 1,
  }));
}
