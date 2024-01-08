export default function convertToGrayscale(
  scalarData,
  width: number,
  height: number
) {
  if (scalarData.length === width * height * 4) {
    const newScalarData = new Float32Array(width * height);
    let offset = 0;
    let destOffset = 0;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const r = scalarData[offset];
        const g = scalarData[offset + 1];
        const b = scalarData[offset + 2];
        newScalarData[destOffset] = r * r + g * g + b * b;
        offset++;
        destOffset++;
      }
    }
    return newScalarData;
  } else {
    return scalarData;
  }
}
