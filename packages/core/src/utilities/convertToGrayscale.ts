export default function convertToGrayscale(
  scalarData,
  width: number,
  height: number
) {
  const isRGBA = scalarData.length === width * height * 4;
  const isRGB = scalarData.length === width * height * 3;
  if (isRGBA || isRGB) {
    const newScalarData = new Float32Array(width * height);
    let offset = 0;
    let destOffset = 0;
    const increment = isRGBA ? 4 : 3;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const r = scalarData[offset];
        const g = scalarData[offset + 1];
        const b = scalarData[offset + 2];
        newScalarData[destOffset] = (r + g + b) / 3;
        offset += increment;
        destOffset++;
      }
    }
    return newScalarData;
  } else {
    return scalarData;
  }
}
