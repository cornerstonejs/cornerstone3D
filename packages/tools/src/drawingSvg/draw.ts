import getSvgDrawingHelper from './getSvgDrawingHelper';

function draw(element: HTMLElement, fn: (svgDrawingElement: any) => any): void {
  const svgDrawingHelper = getSvgDrawingHelper(element);

  // Save...
  fn(svgDrawingHelper);
  // Restore...

  svgDrawingHelper._clearUntouched();
}

export default draw;
