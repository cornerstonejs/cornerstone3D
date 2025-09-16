import type { IImage } from '../types';
export default function decimateImagePixels(image: IImage, factor: number) {
  if (factor <= 1) return image;

  const rows = image.rows ?? image.height;
  const cols = image.columns ?? image.width;
  const newRows = Math.ceil(rows / factor);
  const newCols = Math.ceil(cols / factor);

  const pixelData = image.getPixelData();
  const numComponents = image.numberOfComponents || 1;
  const OutArray = pixelData.constructor as typeof pixelData;
  const out = new OutArray(newRows * newCols * numComponents);

  if (numComponents === 1) {
    let oi = 0;
    for (let r = 0; r < rows; r += factor) {
      const base = r * cols;
      for (let c = 0; c < cols; c += factor) {
        out[oi++] = pixelData[base + c];
      }
    }
  } else {
    let oi = 0;
    for (let r = 0; r < rows; r += factor) {
      const base = r * cols * numComponents;
      for (let c = 0; c < cols; c += factor) {
        const src = base + c * numComponents;
        for (let k = 0; k < numComponents; k++) {
          out[oi++] = pixelData[src + k];
        }
      }
    }
  }

  const rowSpacing = image.rowPixelSpacing ?? image.spacing?.[1];
  const colSpacing = image.columnPixelSpacing ?? image.spacing?.[0];

  return {
    ...image,
    rows: newRows,
    columns: newCols,
    width: newCols,
    height: newRows,
    rowPixelSpacing: rowSpacing ? rowSpacing * factor : rowSpacing,
    columnPixelSpacing: colSpacing ? colSpacing * factor : colSpacing,
    spacing: image.spacing
      ? [image.spacing[0] * factor, image.spacing[1] * factor, image.spacing[2]]
      : image.spacing,
    sizeInBytes: out.byteLength,
    getPixelData: () => out,
  };
}
