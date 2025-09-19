import type { IImage } from '../types';
export default function decimateImagePixels(image: IImage, factor: number) {
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
    for (let r = 0; r < newRows; r++) {
      for (let c = 0; c < newCols; c++) {
        const inR = r * factor;
        const inC = c * factor;
        if (inR < rows && inC < cols) {
          out[oi++] = pixelData[inR * cols + inC];
        }
      }
    }
  } else {
    let oi = 0;
    for (let r = 0; r < newRows; r++) {
      for (let c = 0; c < newCols; c++) {
        const inR = r * factor;
        const inC = c * factor;
        if (inR < rows && inC < cols) {
          const src = (inR * cols + inC) * numComponents;
          for (let k = 0; k < numComponents; k++) {
            out[oi++] = pixelData[src + k];
          }
        }
      }
    }
  }
  const rowSpacing = image.rowPixelSpacing * factor;
  const colSpacing = image.columnPixelSpacing * factor;
  let imageFrame = image.imageFrame
    ? {
        ...image.imageFrame,
        rows: newRows,
        columns: newCols,
        pixelData: out,
        pixelDataLength: out.length,
      }
    : undefined;

  if (imageFrame && imageFrame.imageInfo) {
    imageFrame.imageInfo = {
      ...imageFrame.imageInfo,
      rows: newRows,
      columns: newCols,
    };
  }
  const newSpacing = [
    image.spacing[0] * factor,
    image.spacing[1] * factor,
    image.spacing[2],
  ];
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
    getPixelData: () => imageFrame?.pixelData,
    imageFrame,
  };
}
