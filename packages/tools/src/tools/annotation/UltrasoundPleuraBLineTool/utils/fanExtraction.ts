import type { Types } from '@cornerstonejs/core';
import { cache } from '@cornerstonejs/core';
import { segmentLargestUSOutlineFromBuffer } from './segmentLargestUSOutlineFromBuffer';
import { generateConvexHullFromContour } from './generateConvexHullFromContour';
import { calculateFanShapeCorners } from './calculateFanShapeCorners';
import { deriveFanGeometry } from './deriveFanGeometry';
import type {
  FanShapeContour,
  FanGeometry,
  ContourExportOptions,
  FanExportOptions,
  PixelDataResult,
  FanGeometryResult,
} from './types';
/**
 * Overlays a contour on top of an image buffer and returns a JPEG data URL.
 *
 * @param {Types.PixelDataTypedArray} pixelData
 *   Grayscale (1-channel), RGB (3-channel) or RGBA (4-channel) buffer.
 * @param {number} width  Image width in pixels
 * @param {number} height Image height in pixels
 * @param {FanShapeContour} contour
 *   Array of 2D points in pixel coordinates (closed loop) to draw.
 * @param {ContourExportOptions} [opts]
 *   Optional configuration for the contour rendering.
 * @returns {string}  A data URL "data:image/jpeg;base64,..." you can set as `src` or download.
 */
export function exportContourJpeg(
  pixelData: Types.PixelDataTypedArray,
  width: number,
  height: number,
  contour: FanShapeContour,
  opts: ContourExportOptions = {}
): string {
  const { strokeStyle = '#f00', lineWidth = 2, quality = 0.92 } = opts;

  // Create an offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1) Draw the image pixelData into the canvas
  const totalPixels = width * height;
  const channels = pixelData.length / totalPixels;
  const imgData = ctx.createImageData(width, height);
  const out = imgData.data; // Uint8ClampedArray length = w*h*4

  for (let i = 0; i < totalPixels; i++) {
    const baseIn = i * channels;
    const baseOut = i * 4;
    if (channels === 1) {
      // grayscale → replicate to R,G,B
      const v = pixelData[baseIn];
      out[baseOut] = v;
      out[baseOut + 1] = v;
      out[baseOut + 2] = v;
      out[baseOut + 3] = 255;
    } else {
      // RGB or RGBA: copy first 3 channels, set alpha=channel 4 or opaque
      out[baseOut] = pixelData[baseIn];
      out[baseOut + 1] = pixelData[baseIn + 1];
      out[baseOut + 2] = pixelData[baseIn + 2];
      out[baseOut + 3] = channels === 4 ? pixelData[baseIn + 3] : 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // 2) Draw the contour path
  if (contour.length > 0) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    // move to first point
    ctx.moveTo(contour[0][0] + 0.5, contour[0][1] + 0.5);
    // draw lines through all points
    for (let i = 1; i < contour.length; i++) {
      ctx.lineTo(contour[i][0] + 0.5, contour[i][1] + 0.5);
    }
    // close path
    ctx.closePath();
    ctx.stroke();
  }

  // 3) Export as JPEG data URL
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Retrieves pixel data and dimensions from an image in the Cornerstone cache.
 *
 * @param {string} imageId - The Cornerstone image ID to retrieve
 * @returns {PixelDataResult} Object containing pixelData, width, and height
 *   Returns undefined if the image is not found in cache
 */
export function getPixelData(imageId: string): PixelDataResult | undefined {
  const image = cache.getImage(imageId);
  if (!image) {
    return;
  }
  const width = image.width;
  const height = image.height;
  const pixelData = image.getPixelData();
  return {
    pixelData,
    width,
    height,
  };
}

/**
 * Triggers a file download for binary data represented as a URL.
 *
 * @param {string} url - Data URL or object URL to download
 * @param {string} filename - Name to give the downloaded file
 * @returns {void}
 */
export default function saveBinaryData(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.style.display = 'none';
  a.click();
  a.remove();
}

/**
 * Render a fan-shaped region on top of the image buffer and export as JPEG.
 *
 * @param {Types.PixelDataTypedArray} pixelData
 *   Image buffer: grayscale (1ch), RGB (3ch), or RGBA (4ch)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {FanGeometry} fan - Fan geometry parameters (center, angles, radii)
 * @param {FanExportOptions} [opts] - Optional configuration for the fan rendering
 * @returns {string} JPEG data URL (data:image/jpeg;base64,...)
 */
function exportFanJpeg(
  pixelData: Types.PixelDataTypedArray,
  width: number,
  height: number,
  fan: FanGeometry,
  opts: FanExportOptions = {}
): string {
  const {
    center,
    startAngle: startAngleInDegrees,
    endAngle: endAngleInDegrees,
    innerRadius,
    outerRadius,
  } = fan;
  const { strokeStyle = '#0ff', lineWidth = 2, quality = 0.92 } = opts;

  const startAngle = (startAngleInDegrees * Math.PI) / 180;
  const endAngle = (endAngleInDegrees * Math.PI) / 180;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw the base image
  const total = width * height;
  const channels = pixelData.length / total;
  const imgData = ctx.createImageData(width, height);
  const out = imgData.data;

  for (let i = 0; i < total; i++) {
    const baseOut = i * 4;
    if (channels === 1) {
      const v = pixelData[i];
      out[baseOut] = v;
      out[baseOut + 1] = v;
      out[baseOut + 2] = v;
      out[baseOut + 3] = 255;
    } else {
      const baseIn = i * channels;
      out[baseOut] = pixelData[baseIn];
      out[baseOut + 1] = pixelData[baseIn + 1];
      out[baseOut + 2] = pixelData[baseIn + 2];
      out[baseOut + 3] = channels === 4 ? pixelData[baseIn + 3] : 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Draw fan shape
  ctx.beginPath();

  // Inner arc (start → end)
  for (let a = startAngle; a <= endAngle; a += 0.01) {
    const x = center[0] + innerRadius * Math.cos(a);
    const y = center[1] + innerRadius * Math.sin(a);
    if (a === startAngle) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  // Outer arc (end → start, reversed)
  for (let a = endAngle; a >= startAngle; a -= 0.01) {
    const x = center[0] + outerRadius * Math.cos(a);
    const y = center[1] + outerRadius * Math.sin(a);
    ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Calculates fan geometry from an image and downloads a JPEG visualization.
 *
 * @param {string} imageId - The Cornerstone image ID to process
 * @param {number} contourType - Type of contour to visualize (default: 5)
 *   1: Raw contour
 *   2: Simplified contour
 *   3: Convex hull
 *   4: Refined corner points
 *   5: Fan geometry (default)
 * @returns {void}
 */
export function downloadFanJpeg(
  imageId: string,
  contourType: number = 5
): void {
  const { contour, simplified, hull, refined, fanGeometry } =
    calculateFanGeometry(imageId);
  const { pixelData, width, height } = getPixelData(imageId) || {};
  if (!pixelData) {
    return;
  }
  let jpegDataUrl;
  if (contourType === 1) {
    jpegDataUrl = exportContourJpeg(pixelData, width, height, contour);
  } else if (contourType === 2) {
    jpegDataUrl = exportContourJpeg(pixelData, width, height, simplified);
  } else if (contourType === 3) {
    jpegDataUrl = exportContourJpeg(pixelData, width, height, hull);
  } else if (contourType === 4) {
    jpegDataUrl = exportContourJpeg(pixelData, width, height, [
      refined.P1,
      refined.P2,
      refined.P3,
      refined.P4,
    ]);
  } else {
    jpegDataUrl = exportFanJpeg(pixelData, width, height, fanGeometry, {
      strokeStyle: '#f00', // red outline
      lineWidth: 3,
      quality: 0.95,
    });
  }
  saveBinaryData(jpegDataUrl, 'contour.jpg');
}

/**
 * Calculates the complete fan geometry from an ultrasound image.
 *
 * @param {string} imageId - The Cornerstone image ID to process
 * @returns {FanGeometryResult} An object containing:
 *   - contour: The raw contour points of the ultrasound image
 *   - simplified: A simplified version of the contour with fewer points
 *   - hull: The convex hull of the simplified contour
 *   - refined: The four corner points that define the fan shape
 *   - fanGeometry: The calculated fan geometry parameters
 */
export function calculateFanGeometry(
  imageId: string
): FanGeometryResult | undefined {
  const { pixelData, width, height } = getPixelData(imageId) || {};
  if (!pixelData) {
    return;
  }
  const contour = segmentLargestUSOutlineFromBuffer(pixelData, width, height);
  const { simplified, hull } = generateConvexHullFromContour(contour);
  const refined = calculateFanShapeCorners(
    pixelData,
    width,
    height,
    hull,
    simplified
  );

  const fanGeometry = deriveFanGeometry({
    P1: refined.P1,
    P2: refined.P2,
    P3: refined.P3,
    P4: refined.P4,
  });
  return { contour, simplified, hull, refined, fanGeometry };
}
