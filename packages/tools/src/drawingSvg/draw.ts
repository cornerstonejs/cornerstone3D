import type { SVGDrawingHelper } from '../types';
import getSvgDrawingHelper from './getSvgDrawingHelper';
import { clearTextBoxRegistry } from '../utilities/drawing/textBoxOverlapRegistry';

function draw(
  element: HTMLDivElement,
  fn: (svgDrawingElement: SVGDrawingHelper) => void
): void {
  const svgDrawingHelper = getSvgDrawingHelper(element);

  // Reset the text-box overlap registry so that placements computed in this
  // frame only consider boxes drawn within the same frame.
  if (svgDrawingHelper.svgLayerElement) {
    clearTextBoxRegistry(svgDrawingHelper.svgLayerElement);
  }

  // Save...
  fn(svgDrawingHelper);
  // Restore...

  svgDrawingHelper.clearUntouched();
}

export default draw;
