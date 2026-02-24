export interface CompressResult {
  base64: string;
  mediaType: string;
  originalSize: number;
  compressedSize: number;
}

export function compressImage(file: File, maxWidth = 1200, quality = 0.75): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = (h * maxWidth) / w;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1];
        const compressedSize = Math.round((base64.length * 3) / 4);
        resolve({
          base64,
          mediaType: "image/jpeg",
          originalSize: file.size,
          compressedSize,
        });
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
