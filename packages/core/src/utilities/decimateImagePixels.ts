import type { IImage, PixelDataTypedArray } from '../types';

/**
 * Decimates (downsamples) an image by a specified factor.
 *
 * This function reduces the resolution of an image by sampling every nth pixel
 * in both dimensions, where n is the decimation factor. For example, with a
 * factor of 2, it takes every 2nd pixel, resulting in an image that is 1/4
 * the size (half width × half height).
 *
 * **Values Changed:**
 * - **Dimensions**: `rows`, `columns`, `width`, `height` are divided by factor
 * - **Pixel Spacing**: `rowPixelSpacing`, `columnPixelSpacing` are multiplied by factor
 * - **Spacing Array**: `spacing[0]` and `spacing[1]` are multiplied by factor
 * - **Pixel Data**: New array with `newRows × newCols × numComponents` elements
 * - **Size**: `sizeInBytes` reflects the new pixel data size
 * - **Image Frame**: Updated with new dimensions and pixel data (if present)
 *
 * **Values Preserved:**
 * - `spacing[2]` (Z-spacing/slice thickness) remains unchanged
 * - All other image metadata and properties are copied over
 *
 * @param image - The input image to decimate
 * @param factor - The decimation factor (must be > 1). A factor of 2 means
 *                 take every 2nd pixel, factor of 3 means every 3rd pixel, etc.
 * @returns A new image with reduced resolution, or the original image if
 *          factor <= 1
 *
 * @example
 * // Decimate a 512x512 image by factor of 2 to get 256x256
 * // Original: 512×512, spacing 0.5mm → Result: 256×256, spacing 1.0mm
 * const decimatedImage = decimateImagePixels(originalImage, 2);
 *
 */
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

  // Spacing: preserve k
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
