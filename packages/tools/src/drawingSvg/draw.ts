import type { SVGDrawingHelper } from '../types';
import getSvgDrawingHelper from './getSvgDrawingHelper';

function draw(
  element: HTMLDivElement,
  fn: (svgDrawingElement: SVGDrawingHelper) => void
): void {
  const svgDrawingHelper = getSvgDrawingHelper(element);

  // Save...
  fn(svgDrawingHelper);
  // Restore...

  svgDrawingHelper.clearUntouched();
}

export default draw;
