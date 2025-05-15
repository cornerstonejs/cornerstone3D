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
  ImageBufferResult,
} from './types';
/**
 * Overlays a contour on top of an image buffer and returns a JPEG data URL.
 *
 * @param {ImageBuffer} buffer
 *   Grayscale (1-channel), RGB (3-channel) or RGBA (4-channel) buffer.
 * @param {number} width  Image width
 * @param {number} height Image height
 * @param {FanShapeContour} contour
 *   Array of {x,y} points in pixel coords (closed loop) to draw.
 * @param {ContourExportOptions} [opts]
 * @returns {string}  A data URL "data:image/jpeg;base64,..." you can set as `src` or download.
 */
export function exportContourJpeg(
  buffer: Types.PixelDataTypedArray,
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

  // 1) Draw the image buffer into the canvas
  const totalPixels = width * height;
  const channels = buffer.length / totalPixels;
  const imgData = ctx.createImageData(width, height);
  const out = imgData.data; // Uint8ClampedArray length = w*h*4

  for (let i = 0; i < totalPixels; i++) {
    const baseIn = i * channels;
    const baseOut = i * 4;
    if (channels === 1) {
      // grayscale → replicate to R,G,B
      const v = buffer[baseIn];
      out[baseOut] = v;
      out[baseOut + 1] = v;
      out[baseOut + 2] = v;
      out[baseOut + 3] = 255;
    } else {
      // RGB or RGBA: copy first 3 channels, set alpha=channel 4 or opaque
      out[baseOut] = buffer[baseIn];
      out[baseOut + 1] = buffer[baseIn + 1];
      out[baseOut + 2] = buffer[baseIn + 2];
      out[baseOut + 3] = channels === 4 ? buffer[baseIn + 3] : 255;
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

export function getImageBuffer(imageId: string): ImageBufferResult {
  const image = cache.getImage(imageId);
  const width = image.width;
  const height = image.height;
  const imageBuffer = image.getPixelData();
  return {
    imageBuffer,
    width,
    height,
  };
}

export default function saveBinaryData(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.style.display = 'none';
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Render a fan-shaped region on top of the image buffer and export as JPEG.
 *
 * @param {ImageBuffer} buffer
 *   Image buffer: grayscale (1ch), RGB (3ch), or RGBA (4ch)
 * @param {number} width
 * @param {number} height
 * @param {FanGeometry} fan
 * @param {FanExportOptions} [opts]
 * @returns {string} JPEG data URL (data:image/jpeg;base64,...)
 */
function exportFanJpeg(
  buffer: Types.PixelDataTypedArray,
  width: number,
  height: number,
  fan: FanGeometry,
  opts: FanExportOptions = {}
): string {
  const { center, startAngle, endAngle, innerRadius, outerRadius } = fan;
  const { strokeStyle = '#0ff', lineWidth = 2, quality = 0.92 } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw the base image
  const total = width * height;
  const channels = buffer.length / total;
  const imgData = ctx.createImageData(width, height);
  const out = imgData.data;

  for (let i = 0; i < total; i++) {
    const baseOut = i * 4;
    if (channels === 1) {
      const v = buffer[i];
      out[baseOut] = v;
      out[baseOut + 1] = v;
      out[baseOut + 2] = v;
      out[baseOut + 3] = 255;
    } else {
      const baseIn = i * channels;
      out[baseOut] = buffer[baseIn];
      out[baseOut + 1] = buffer[baseIn + 1];
      out[baseOut + 2] = buffer[baseIn + 2];
      out[baseOut + 3] = channels === 4 ? buffer[baseIn + 3] : 255;
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

export function downloadFanJpeg(imageId: string): void {
  const fanGeometry = calculateFanGeometry(imageId);
  const { imageBuffer, width, height } = getImageBuffer(imageId);
  const jpegDataUrl = exportFanJpeg(imageBuffer, width, height, fanGeometry, {
    strokeStyle: '#f00', // red outline
    lineWidth: 3,
    quality: 0.95,
  });
  saveBinaryData(jpegDataUrl, 'contour.jpg');
}

export function calculateFanGeometry(imageId: string): FanGeometry {
  const { imageBuffer, width, height } = getImageBuffer(imageId);
  const contour = segmentLargestUSOutlineFromBuffer(imageBuffer, width, height);
  const hull = generateConvexHullFromContour(contour);
  const refined = calculateFanShapeCorners(imageBuffer, width, height, hull);

  const fanGeometry = deriveFanGeometry({
    P1: refined.P1,
    P2: refined.P2,
    P3: refined.P3,
    P4: refined.P4,
  });
  return fanGeometry;
}
