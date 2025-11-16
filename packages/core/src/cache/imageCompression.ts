/**
 * Image compression utilities for Cornerstone3D cache
 *
 * This module provides functions to compress and decompress Cornerstone images
 * using browser-native canvas APIs. Images are converted to WebP or JPEG format
 * to significantly reduce memory usage while maintaining visual quality.
 *
 * The compression process:
 * 1. Renders the Cornerstone image to a canvas
 * 2. Converts the canvas to a compressed blob (WebP/JPEG)
 * 3. Stores the blob in the cache
 *
 * The decompression process:
 * 1. Loads the blob as an HTML Image element
 * 2. Renders it to a canvas
 * 3. Converts back to a Cornerstone image object
 */

import type { IImage } from '../types';
import { ImageQualityStatus, VOILUTFunctionType } from '../enums';

/**
 * Compress a Cornerstone image to a blob
 *
 * Converts a Cornerstone image to a compressed image format (WebP or JPEG) by
 * rendering it to a canvas and using the browser's native compression capabilities.
 * This can reduce memory usage by 10-20x for typical medical images.
 *
 * @param image - Cornerstone image object to compress
 * @param format - Image format ('webp' recommended, or 'jpeg')
 * @param quality - Compression quality (0.0 to 1.0, where 1.0 is highest quality)
 * @returns Promise resolving to compressed blob
 */
export async function compressImageToBlob(
  image: IImage,
  format: 'webp' | 'jpeg',
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      // Create canvas from image
      const canvas = createCanvasFromImage(image);

      // Determine MIME type
      const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';

      // Convert canvas to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        mimeType,
        quality
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Decompress a blob back to a Cornerstone image
 *
 * Converts a compressed image blob (WebP/JPEG) back to a Cornerstone image object
 * by loading it as an HTML Image, rendering to canvas, and extracting pixel data.
 * The resulting image will have ImageQualityStatus.SUBRESOLUTION to indicate
 * it was decompressed from a lossy format.
 *
 * @param blob - Compressed image blob (WebP or JPEG)
 * @param imageId - Image identifier for the Cornerstone image
 * @returns Promise resolving to Cornerstone image object
 */
export async function decompressBlobToImage(
  blob: Blob,
  imageId: string
): Promise<IImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      try {
        // Create canvas from loaded image
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get 2D context');
        }

        ctx.drawImage(img, 0, 0);

        // Create Cornerstone image from canvas
        const csImage = createImageFromCanvas(canvas, imageId);

        URL.revokeObjectURL(url);
        resolve(csImage);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image from blob'));
    };

    img.src = url;
  });
}

/**
 * Create a canvas from a Cornerstone image
 * @param image - Cornerstone image object
 * @returns HTMLCanvasElement with image rendered
 */
function createCanvasFromImage(image: IImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width || image.columns;
  canvas.height = image.height || image.rows;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context');
  }

  // Check if image has a canvas method
  if (typeof image.getCanvas === 'function') {
    const sourceCanvas = image.getCanvas();
    ctx.drawImage(sourceCanvas, 0, 0);
    return canvas;
  }

  // Otherwise, use pixel data
  if (typeof image.getPixelData === 'function') {
    const pixelData = image.getPixelData();
    const imageData = ctx.createImageData(canvas.width, canvas.height);

    // Handle different pixel data formats
    if (image.color && image.rgba) {
      // RGBA format
      for (let i = 0; i < pixelData.length; i++) {
        imageData.data[i] = pixelData[i];
      }
    } else if (image.color && !image.rgba) {
      // RGB format (need to add alpha channel)
      for (let i = 0, j = 0; i < pixelData.length; i += 3, j += 4) {
        imageData.data[j] = pixelData[i]; // R
        imageData.data[j + 1] = pixelData[i + 1]; // G
        imageData.data[j + 2] = pixelData[i + 2]; // B
        imageData.data[j + 3] = 255; // A
      }
    } else {
      // Grayscale format
      for (let i = 0, j = 0; i < pixelData.length; i++, j += 4) {
        const value = pixelData[i];
        imageData.data[j] = value; // R
        imageData.data[j + 1] = value; // G
        imageData.data[j + 2] = value; // B
        imageData.data[j + 3] = 255; // A
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  throw new Error('Image has no renderable data (getCanvas or getPixelData)');
}

/**
 * Create a Cornerstone image from a canvas
 * @param canvas - Canvas element with image data
 * @param imageId - Image identifier
 * @returns Cornerstone image object
 */
function createImageFromCanvas(
  canvas: HTMLCanvasElement,
  imageId: string
): IImage {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context');
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return {
    imageId,
    minPixelValue: 0,
    maxPixelValue: 255,
    slope: 1,
    intercept: 0,
    windowCenter: 128,
    windowWidth: 256,
    voiLUTFunction: VOILUTFunctionType.LINEAR,
    getPixelData: () => imageData.data,
    getCanvas: () => canvas,
    rows: canvas.height,
    columns: canvas.width,
    height: canvas.height,
    width: canvas.width,
    color: true,
    rgba: true,
    numberOfComponents: 4,
    columnPixelSpacing: 1,
    rowPixelSpacing: 1,
    sizeInBytes: imageData.data.length,
    imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
    invert: false,
    dataType: 'Uint8Array',
  };
}
