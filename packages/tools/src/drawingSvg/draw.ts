import getSvgDrawingHelper from './getSvgDrawingHelper';

function draw(
  element: HTMLDivElement,
  fn: (svgDrawingElement: any) => any
): void {
  const svgDrawingHelper = getSvgDrawingHelper(element);

  // Save...
  fn(svgDrawingHelper);
  // Restore...

  svgDrawingHelper.clearUntouched();
}

export default draw;
