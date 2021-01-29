import _getHashFromSvgElement from './_getHashFromSvgElement'
import getSvgDrawingHelper from './getSvgDrawingHelper'

export default function (
  canvasElement: HTMLCanvasElement,
  fn: (svgDrawingElement: any) => any
): void {
  const svgDrawingHelper = getSvgDrawingHelper(canvasElement)

  // Save...
  fn(svgDrawingHelper)
  // Restore...

  const nodes = svgDrawingHelper._svgLayerElement.querySelectorAll(
    'svg#svg-layer > *'
  ) as NodeListOf<SVGElement>
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    // Skip nodes that aren't specific to the tool data we're
    // attempting to draw w/ this call
    // if (node.dataset.toolUid !== toolName) {
    //   continue
    // }

    // TODO: String manipulation is expensive
    // Just track and compare the four properties?
    // Create a SET?
    const svgNodeHash = _getHashFromSvgElement(node)
    const wasRedrawn = svgDrawingHelper._drawnAnnotations[svgNodeHash] === true

    if (!wasRedrawn) {
      // console.log(`Removing: ${svgNodeHash}`)
      svgDrawingHelper._svgLayerElement.removeChild(node)
    }
  }
}
