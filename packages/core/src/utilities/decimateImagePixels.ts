import type { IImage, PixelDataTypedArray } from '../types';
export default function decimateImagePixels(image: IImage, factor: number) {
  // Trivial case: no decimation requested
  if (!factor || factor <= 1) {
    return image;
  }

  const rows = image.rows ?? image.height;
  const cols = image.columns ?? image.width;
  const newRows = Math.floor(rows / factor);
  const newCols = Math.floor(cols / factor);

  const pixelData = image.getPixelData();
  const numComponents = image.numberOfComponents || 1;
  const OutArrayCtor = pixelData.constructor as unknown as new (
    length: number
  ) => PixelDataTypedArray;
  const out = new OutArrayCtor(newRows * newCols * numComponents);

  let outIndex = 0;
  for (let r = 0; r < newRows; r++) {
    const inR = r * factor;
    for (let c = 0; c < newCols; c++) {
      const inC = c * factor;
      const src = (inR * cols + inC) * numComponents;
      for (let k = 0; k < numComponents; k++) {
        out[outIndex++] = pixelData[src + k];
      }
    }
  }

  // Spacing: prefer explicit row/column spacing; preserve Z
  const s = (image as unknown as { spacing?: [number, number, number] })
    .spacing;
  const newSpacing: [number, number, number] = [
    (image.columnPixelSpacing ?? s?.[0] ?? 1) * factor,
    (image.rowPixelSpacing ?? s?.[1] ?? 1) * factor,
    s?.[2] ?? image.sliceThickness ?? 1,
  ];
  const colSpacing = newSpacing[0];
  const rowSpacing = newSpacing[1];

  // Carry over imageFrame when present
  let imageFrame = image.imageFrame
    ? {
        ...image.imageFrame,
        rows: newRows,
        columns: newCols,
        pixelData: out,
        pixelDataLength: out.length,
      }
    : undefined;
  // Note: some loaders attach a non-standard imageInfo; skip updating to avoid type casting.

  return {
    ...image,
    rows: newRows,
    columns: newCols,
    width: newCols,
    height: newRows,
    rowPixelSpacing: rowSpacing,
    columnPixelSpacing: colSpacing,
    spacing: newSpacing,
    sizeInBytes: out.byteLength,
    getPixelData: () => imageFrame?.pixelData ?? out,
    imageFrame,
  };
}
