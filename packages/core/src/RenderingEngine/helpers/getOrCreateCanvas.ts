const VIEWPORT_ELEMENT = 'viewport-element';
const CANVAS_CSS_CLASS = 'cornerstone-canvas';

/**
 * Create a canvas and append it to the element
 *
 * @param element - An HTML Element
 * @returns canvas - A Canvas DOM element
 */
function createCanvas(element: Element | HTMLDivElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

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
  div.classList.add(VIEWPORT_ELEMENT);
  element.appendChild(div);

  return div;
}

/**
 * Create a canvas or returns the one that already exists for a given element.
 * It first checks if the element has a canvas, if not it creates one and returns it.
 * The canvas is updated for:
 *   1. width/height in screen pixels to just fit inside the div element
 *   2. CSS width/height in CSS pixels to be the size of the physical screen pixels
 *      width and height (from #1)
 * This allows drawing to the canvas and having pixel perfect/exact drawing to
 * the physical screen pixels.
 *
 * @param element - An HTML Element
 * @returns canvas a Canvas DOM element
 */
export default function getOrCreateCanvas(
  element: HTMLDivElement
): HTMLCanvasElement {
  const canvasSelector = `canvas.${CANVAS_CSS_CLASS}`;
  const viewportElement = `div.${VIEWPORT_ELEMENT}`;

  // Internal div with `relative` positioning to enable absolute positioning
  // of the canvas and svg layer.
  const internalDiv =
    element.querySelector(viewportElement) || createViewportElement(element);

  const canvas = (internalDiv.querySelector(canvasSelector) ||
    createCanvas(internalDiv)) as HTMLCanvasElement;
  // Fit the canvas into the div
  const rect = internalDiv.getBoundingClientRect();
  const devicePixelRatio = window.devicePixelRatio || 1;

  // The left/top can be fractional physical pixels, round UP to the nearest
  // physical pixel on the left/top hand edge.
  const left = Math.ceil(rect.x * devicePixelRatio) - rect.x * devicePixelRatio;
  const top = Math.ceil(rect.y * devicePixelRatio) - rect.y * devicePixelRatio;
  // The width/height is the number of physical pixels which fit into the
  // remaining space without any fractional pixels left over
  // The floor is because we don't want any fractional pixels left over.
  const width = Math.floor(rect.width * devicePixelRatio - left);
  const height = Math.floor(rect.height * devicePixelRatio - top);
  canvas.width = width;
  canvas.height = height;
  // Reset the size of the canvas to be the number of physical pixels,
  // expressed as CSS pixels, with a tiny extra amount to prevent clipping
  // to the next lower size in the physical display.
  canvas.style.width = (width + 0.01) / devicePixelRatio + 'px';
  canvas.style.height = (height + 0.01) / devicePixelRatio + 'px';
  // In theory it should be required to do the following, but in practice
  // the browser seems to do this internally
  // canvas.style.left = (left - 0.02) / devicePixelRatio + 'px';
  // canvas.style.top = (top - 0.02) / devicePixelRatio + 'px';

  return canvas;
}
