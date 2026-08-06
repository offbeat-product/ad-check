import { describe, expect, it } from "vitest";
import { getSharedCheckDownloadPayload, getSharedPreviewSources } from "@/lib/download-project-file";
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

  it("falls back to after_url for comparison audio", () => {
    const src = getSharedPreviewSources(
      fakeRecord({
        process_type: "narration",
        input_data: { after_url: "https://example.com/a.mp3" },
      })
    );
    expect(src.audioSrc).toBe("https://example.com/a.mp3");
  });

  it("uses after_text for comparison scripts", () => {
    const src = getSharedPreviewSources(
      fakeRecord({
        process_type: "script",
        input_data: { after_text: "修正後テキスト" },
      })
    );
    expect(src.scriptText).toBe("修正後テキスト");
  });
});

describe("shared preview/download parity (regression guard)", () => {
  it("preview and download resolve the same comparison image", () => {
    const record = fakeRecord({
      input_data: {
        after_image: "data:image/png;base64,comparison-only",
      },
    });
    const preview = getSharedPreviewSources(record);
    const download = getSharedCheckDownloadPayload(record);
    expect(preview.imageSrc).toBe("data:image/png;base64,comparison-only");
    expect(download?.source.file_data).toBe(preview.imageSrc);
  });

  it("preview and download resolve the same comparison video", () => {
    const record = fakeRecord({
      process_type: "video_horizontal",
      input_data: { after_url: "https://cdn.example/after.mp4" },
    });
    const preview = getSharedPreviewSources(record);
    const download = getSharedCheckDownloadPayload(record);
    expect(preview.videoSrc).toBe("https://cdn.example/after.mp4");
    expect(download?.source.file_data).toBe(preview.videoSrc);
  });

  it("prefers initial image_url over before_image fallback", () => {
    const record = fakeRecord({
      input_data: {
        image_url: "https://cdn.example/initial.png",
        before_image: "data:image/png;base64,old",
      },
    });
    expect(getSharedPreviewSources(record).imageSrc).toBe("https://cdn.example/initial.png");
  });
});
