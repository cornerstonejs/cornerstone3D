const VIEWPORT_ELEMENT = 'viewport-element';
const CANVAS_CSS_CLASS = 'cornerstone-canvas';
export const EPSILON = 1e-4;

/**
 * The canvas creator is used for applications where the element isn't
 * defined/setup such as nodejs environments.
 */
let canvasCreator;

/**
 * Create a canvas and append it to the element
 *
 * @param element - An HTML Element
 * @returns canvas - A Canvas DOM element
 */
export function createCanvas(
  element: Element | HTMLDivElement,
  width = 512,
  height = 512
): HTMLCanvasElement {
  const canvas = canvasCreator
    ? canvasCreator(width, height)
    : document.createElement('canvas');

  if (!element) {
    return canvas;
  }

  canvas.style.position = 'absolute';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.imageRendering = 'pixelated';
  canvas.classList.add(CANVAS_CSS_CLASS);
  element.appendChild(canvas);

  return canvas;
}

/**
 * Creates an internal div that will contain canvas and SVG layer as children
 * @param element - An HTML Element
 * @returns div Cornerstone internal div that will include the canvas and SVG
 * as its children
 */
export function createViewportElement(element: HTMLDivElement): HTMLDivElement {
  const div = document.createElement('div');
  div.style.position = 'relative';
  div.style.width = '100%';
  div.style.height = '100%';
  // Hide any canvas elements not viewable
  div.style.overflow = 'hidden';
  div.classList.add(VIEWPORT_ELEMENT);
  element.appendChild(div);

  return div;
}

/**
 * Allows setting the canvas creator for rendering into.  This provides direct
 * render capabilities for environments such as nodejs
 * @param canvasCreatorArg
 */
export function setCanvasCreator(canvasCreatorArg) {
  canvasCreator = canvasCreatorArg;
}

/**
 * Extent to match when updating from a render result (e.g. offscreen canvas or viewport size).
 */
export type ViewportCanvasExtent =
  | HTMLCanvasElement
  | { width: number; height: number };

/**
 * Updates an on-screen viewport canvas size and aspect ratio so it fills
 * correctly and resizes without flicker. Handles two cases:
 *
 * 1. No extent/offscreen: size from the canvas's displayed rect (e.g. when
 *    enabling viewports or after layout change). Returns undefined.
 *
 * 2. Extent or offscreen canvas provided: size to match the rendered extent.
 *    Returns true if the canvas was updated (caller should redraw), false if
 *    it already matched.
 *
 * @param canvas - The on-screen canvas to update.
 * @param extentOrOffscreen - Optional. When an HTMLCanvasElement, use its
 *   width/height as the target extent. When an object with width and height
 *   (e.g. viewport sWidth/sHeight when the offscreen canvas is shared), use that.
 * @returns undefined when no extent/offscreen (element-rect update);
 *   true when canvas was updated (rendering/redraw needed);
 *   false when canvas already matched the extent.
 */
export function updateCanvasSizeAndAspectRatio(
  canvas: HTMLCanvasElement,
  extentOrOffscreen?: ViewportCanvasExtent
): boolean | undefined {
  if (extentOrOffscreen === undefined) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * devicePixelRatio);
    const h = Math.round(rect.height * devicePixelRatio);
    if (w > 0 && h > 0) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.aspectRatio = `${w} / ${h}`;
    }
    return undefined;
  }

  const { width: targetW, height: targetH } = extentOrOffscreen;

  if (targetW < 1 || targetH < 1) {
    return false;
  }

  const needsUpdate = canvas.width !== targetW || canvas.height !== targetH;

  if (needsUpdate) {
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.aspectRatio = `${targetW} / ${targetH}`;
    return true;
  }

  return false;
}

/**
 * Create a canvas or returns the one that already exists for a given element.
 * It first checks if the element has a canvas, if not it creates one and returns it.
 * The canvas is updated for:
 *   1. width/height in screen pixels to completely cover the div element
 *   2. CSS width/height in CSS pixels to be the size of the physical screen pixels
 *      width and height (from #1)
 * This allows drawing to the canvas and having pixel perfect/exact drawing to
 * the physical screen pixels.
 *
 * @param element - An HTML Element
 * @returns canvas a Canvas DOM element
 */
export function getOrCreateCanvas(element: HTMLDivElement): HTMLCanvasElement {
  const canvasSelector = `canvas.${CANVAS_CSS_CLASS}`;
  const viewportElement = `div.${VIEWPORT_ELEMENT}`;

  // Internal div with `relative` positioning to enable absolute positioning
  // of the canvas and svg layer.
  const internalDiv =
    element.querySelector(viewportElement) || createViewportElement(element);

  const existingCanvas: HTMLCanvasElement | null =
    internalDiv.querySelector(canvasSelector);
  if (existingCanvas) {
    return existingCanvas;
  }

  const canvas = createCanvas(internalDiv);
  // Fit the canvas into the div
  const rect = internalDiv.getBoundingClientRect();
  const devicePixelRatio = window.devicePixelRatio || 1;

  // The width/height is the number of physical pixels which will completely
  // cover the div so that no pixels, fractional or full are left uncovered.
  // Thus, it is the ceiling of the CSS size times the physical pixels.
  // In theory, the physical pixels can be offset from CSS pixels, but in practice
  // this hasn't been observed.
  const width = Math.ceil(rect.width * devicePixelRatio);
  const height = Math.ceil(rect.height * devicePixelRatio);
  // does weird things given 0 or NaN for the division
  // Also weird when the canvas size is zero
  if (width > 0 && height > 0) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.aspectRatio = `${width} / ${height}`;
  }
  // Reset the size of the canvas to be the number of physical pixels,
  // expressed as CSS pixels, with a tiny extra amount to prevent clipping
  // to the next lower size in the physical display.
  // canvas.style.width = (width + EPSILON) / devicePixelRatio + 'px';
  // canvas.style.height = (height + EPSILON) / devicePixelRatio + 'px';

  return canvas;
}

export default getOrCreateCanvas;
