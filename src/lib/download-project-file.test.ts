import { describe, expect, it } from "vitest";
import { getSharedPreviewSources } from "@/lib/download-project-file";
import type { CheckResultRow } from "@/lib/db-types";

function fakeRecord(overrides: Partial<CheckResultRow>): CheckResultRow {
  return {
    id: "cr-1",
    process_type: "styleframe",
    input_data: null,
    input_text: null,
    product_code: "HP",
    client_name: "CA",
    product_name: "Hotpepper",
    ...overrides,
  } as CheckResultRow;
}

describe("getSharedPreviewSources", () => {
  it("uses image_url for initial image checks", () => {
    const src = getSharedPreviewSources(
      fakeRecord({
        input_data: { image_url: "https://example.com/a.png" },
      })
    );
    expect(src.inputMode).toBe("image");
    expect(src.imageSrc).toBe("https://example.com/a.png");
  });

  it("falls back to after_image for comparison results", () => {
    const src = getSharedPreviewSources(
      fakeRecord({
        input_data: {
          after_image: "data:image/png;base64,aaa",
          before_image: "data:image/png;base64,bbb",
        },
      })
    );
    expect(src.imageSrc).toBe("data:image/png;base64,aaa");
  });

  it("falls back to after_url for comparison videos", () => {
    const src = getSharedPreviewSources(
      fakeRecord({
        process_type: "video_horizontal",
        input_data: { after_url: "https://example.com/v.mp4" },
      })
    );
    expect(src.inputMode).toBe("video");
    expect(src.videoSrc).toBe("https://example.com/v.mp4");
  });
});
