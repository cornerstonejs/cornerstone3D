function calculateMinMaxMean(pixelLuminance, globalMin, globalMax) {
  const numPixels = pixelLuminance.length;
  let min = globalMax;
  let max = globalMin;
  let sum = 0;

  if (numPixels < 2) {
    return {
      min,
      max,
      mean: (globalMin + globalMax) / 2,
    };
  }

  for (let index = 0; index < numPixels; index++) {
    const spv = pixelLuminance[index];

    min = Math.min(min, spv);
    max = Math.max(max, spv);
    sum += spv;
  }

  return {
    min,
    max,
    mean: sum / numPixels,
  };
}

export { calculateMinMaxMean };
