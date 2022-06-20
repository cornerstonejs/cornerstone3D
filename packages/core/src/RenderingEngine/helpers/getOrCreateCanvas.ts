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

  return internalDiv.querySelector(canvasSelector) || createCanvas(internalDiv);
}
