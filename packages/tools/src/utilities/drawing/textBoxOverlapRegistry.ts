/**
 * Per-viewport registry that tracks rendered text-box bounding rectangles.
 *
 * During each annotation render cycle the registry is:
 *   1. Cleared at the start            (via `clearTextBoxRegistry`)
 *   2. Populated after each text box    (via `registerTextBox` – called from
 *      drawTextBox.ts)
 *   3. Queried before placing a new box (via `getRegisteredTextBoxes` – used
 *      by getTextBoxCoordsCanvas.ts to avoid overlap)
 *
 * The registry is keyed by the viewport SVG-layer element which is unique per
 * viewport and naturally scoped to a single render frame.
 */

export interface TextBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const registry = new WeakMap<Element, TextBoxRect[]>();

/**
 * Clear all tracked text boxes for a viewport.
 * Called at the beginning of each render cycle (draw.ts).
 */
export function clearTextBoxRegistry(svgLayerElement: Element): void {
  registry.set(svgLayerElement, []);
}

/**
 * Register a rendered text box so subsequent placements can avoid it.
 * Called from drawTextBox.ts after each text box is drawn.
 */
export function registerTextBox(
  svgLayerElement: Element,
  rect: TextBoxRect
): void {
  let boxes = registry.get(svgLayerElement);
  if (!boxes) {
    boxes = [];
    registry.set(svgLayerElement, boxes);
  }
  boxes.push({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

/**
 * Return all text boxes registered so far for the given viewport.
 */
export function getRegisteredTextBoxes(
  svgLayerElement: Element
): TextBoxRect[] {
  return registry.get(svgLayerElement) || [];
}
