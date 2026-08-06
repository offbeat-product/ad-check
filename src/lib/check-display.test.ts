import { describe, expect, it } from "vitest";
import {
  collectResolvedIdsForItem,
  getCheckItemId,
  getEffectiveSubmitLabel,
  isCheckItemResolved,
  normalizeResolvedItemIds,
} from "@/lib/check-display";

describe("resolved NG submit validation", () => {
  const ngItem = {
    status: "NG",
    pattern_id: "AUTO-3D9A9A8B",
    item: "サイズ規定",
    detail: "1000x1000",
  };

  it("treats pattern_id-only resolved entries as resolved", () => {
    expect(isCheckItemResolved(ngItem, ["AUTO-3D9A9A8B"])).toBe(true);
  });

  it("treats hashed ids as resolved via pattern prefix", () => {
    const hashed = getCheckItemId(ngItem);
    expect(isCheckItemResolved(ngItem, [hashed])).toBe(true);
    expect(isCheckItemResolved({ ...ngItem, detail: "other" }, [hashed])).toBe(true);
  });

  it("returns GO when all NG items are resolved even if overall_status is C", () => {
    const hashed = getCheckItemId(ngItem);
    const result = getEffectiveSubmitLabel("C", [ngItem], [hashed]);
    expect(result).toEqual({ label: "GO", isOk: true });
  });

  it("collects sibling ids for the same pattern", () => {
    const sibling = { ...ngItem, detail: "別詳細" };
    const ids = collectResolvedIdsForItem(ngItem, [ngItem, sibling]);
    expect(ids).toContain("AUTO-3D9A9A8B");
    expect(ids).toContain(getCheckItemId(ngItem));
    expect(ids).toContain(getCheckItemId(sibling));
  });

  it("normalizes resolved_items json shapes", () => {
    expect(normalizeResolvedItemIds(["a", { id: "b" }, 1, null])).toEqual(["a", "b"]);
  });
});
