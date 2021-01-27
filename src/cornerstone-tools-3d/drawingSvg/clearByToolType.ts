import getSvgDrawingHelper from './getSvgDrawingHelper'

function clearByToolType(
  canvasElement: HTMLCanvasElement,
  toolType: string
): void {
  const svgDrawingHelper = getSvgDrawingHelper(canvasElement)
  const nodes = svgDrawingHelper._svgLayerElement.querySelectorAll(
    'svg > *'
  ) as NodeListOf<SVGElement>

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const toolUID = node.dataset.toolUid

    if (toolUID === toolType) {
      svgDrawingHelper._svgLayerElement.removeChild(node)
    }
  }
}

export default clearByToolType
