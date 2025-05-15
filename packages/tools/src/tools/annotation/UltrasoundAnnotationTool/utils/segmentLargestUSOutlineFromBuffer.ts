import type { FanShapeContour } from './types';

/**
 * Given a raw image buffer (grayscale, RGB, or RGBA) plus dimensions,
 * returns the contour of the largest non-black region.
 *
 * @param {Uint8Array|Uint8ClampedArray|Array<number>} buffer
 *   Length must be width*height (grayscale), width*height*3 (RGB), or width*height*4 (RGBA).
 * @param {number} width   Image width in pixels
 * @param {number} height  Image height in pixels
 * @returns {Array<Point2>}  Clockwise contour of largest blob
 */
export function segmentLargestUSOutlineFromBuffer(
  buffer,
  width,
  height
): FanShapeContour {
  const totalPixels = width * height;
  const channelCount = buffer.length / totalPixels;
  if (![1, 3, 4].includes(channelCount)) {
    throw new Error('Buffer must be 1, 3, or 4 channels per pixel');
  }

  // 1) Build binary mask: true = any channel > 0
  const mask = Array.from({ length: height }, () =>
    new Array(width).fill(false)
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const base = pixelIndex * channelCount;
      let isForeground = false;
      // check R, G, B channels (or just the single channel)
      for (let c = 0; c < Math.min(3, channelCount); c++) {
        if (buffer[base + c] > 0) {
          isForeground = true;
          break;
        }
      }
      mask[y][x] = isForeground;
    }
  }

  // 2) Connected-component labeling (4-connectivity)
  const labels = Array.from({ length: height }, () => new Array(width).fill(0));
  let currentLabel = 0;
  const regionSizes = {};

  function floodFill(sx, sy, label) {
    const stack = [[sx, sy]];
    labels[sy][sx] = label;
    let count = 0;
    while (stack.length) {
      const [x, y] = stack.pop();
      count++;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (
          nx >= 0 &&
          nx < width &&
          ny >= 0 &&
          ny < height &&
          mask[ny][nx] &&
          labels[ny][nx] === 0
        ) {
          labels[ny][nx] = label;
          stack.push([nx, ny]);
        }
      }
    }
    return count;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y][x] && labels[y][x] === 0) {
        currentLabel++;
        regionSizes[currentLabel] = floodFill(x, y, currentLabel);
      }
    }
  }

  if (currentLabel === 0) {
    return []; // no foreground
  }

  // 3) Find the label of the largest region
  const largestLabel = Object.keys(regionSizes).reduce((a, b) =>
    regionSizes[a] > regionSizes[b] ? a : b
  );

  // 4) Helper to test if (x,y) is a border pixel of the largest region
  function isBorder(x, y) {
    if (labels[y][x] !== +largestLabel) {
      return false;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (
        nx < 0 ||
        nx >= width ||
        ny < 0 ||
        ny >= height ||
        labels[ny][nx] !== +largestLabel
      ) {
        return true;
      }
    }
    return false;
  }

  // 5) Find a starting border pixel
  let start = null;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBorder(x, y)) {
        start = [x, y];
        break outer;
      }
    }
  }
  if (!start) {
    return []; // no border found
  }

  // 6) Moore-neighbor contour tracing (8-connectivity, clockwise)
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const contour = [];
  let current = start;
  let prev = [start[0] - 1, start[1]];

  do {
    contour.push([current[0], current[1]]);

    // find index of direction from current → prev
    const dx0 = prev[0] - current[0],
      dy0 = prev[1] - current[1];
    let startDir = dirs.findIndex((d) => d[0] === dx0 && d[1] === dy0);
    if (startDir < 0) {
      startDir = 0;
    }

    // scan neighbors clockwise for next border pixel
    let nextPt = null;
    for (let k = 1; k <= 8; k++) {
      const [dx, dy] = dirs[(startDir + k) % 8];
      const nx = current[0] + dx,
        ny = current[1] + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && isBorder(nx, ny)) {
        nextPt = [nx, ny];
        // backtrack: pixel just before nextPt in the scan
        const [bdx, bdy] = dirs[(startDir + k - 1 + 8) % 8];
        prev = [current[0] + bdx, current[1] + bdy];
        break;
      }
    }

    if (!nextPt) {
      break; // contour is broken
    }
    current = nextPt;
  } while (current[0] !== start[0] || current[1] !== start[1]);

  return contour;
}
