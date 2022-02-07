function toWindowLevel(
  low: number,
  high: number
): {
  windowWidth: number;
  windowCenter: number;
} {
  const windowWidth = Math.abs(low - high);
  const windowCenter = low + windowWidth / 2;

  return { windowWidth, windowCenter };
}

function toLowHighRange(
  windowWidth: number,
  windowCenter: number
): {
  lower: number;
  upper: number;
} {
  const lower = windowCenter - windowWidth / 2.0;
  const upper = windowCenter + windowWidth / 2.0;

  return { lower, upper };
}

export default {
  toWindowLevel,
  toLowHighRange,
};
