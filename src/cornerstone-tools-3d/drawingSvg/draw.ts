import getSvgDrawingHelper from './getSvgDrawingHelper'

function draw(
  canvasElement: HTMLCanvasElement,
  fn: (svgDrawingElement: any) => any
): void {
  const svgDrawingHelper = getSvgDrawingHelper(canvasElement)

  // Save...
  fn(svgDrawingHelper)
  // Restore...

  svgDrawingHelper._clearUntouched()
}

export default draw
