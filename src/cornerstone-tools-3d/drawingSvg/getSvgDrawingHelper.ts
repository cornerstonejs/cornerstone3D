import _getHashFromSvgElement from './_getHashFromSvgElement'

/**
 *
 * @param canvasElement
 * @private
 */
function getSvgDrawingHelper(canvasElement: HTMLCanvasElement) {
  const svgLayerElement = _getSvgLayer(canvasElement)
  const annotationUIDs = _getUniqueAnnotationUIDs(svgLayerElement)
  const drawnAnnotations = annotationUIDs.reduce((acc, uid, ind, arr) => {
    acc[uid] = false

    return acc
  }, {})

  return {
    _canvasElement: canvasElement,
    _svgLayerElement: svgLayerElement,
    _drawnAnnotations: drawnAnnotations,
  }
}

function _getUniqueAnnotationUIDs(svgLayerElement: SVGElement): string[] {
  const annotationUIDs = []
  const nodes = svgLayerElement.querySelectorAll(
    'svg > *'
  ) as NodeListOf<SVGElement>

  // Add unique annotationUIDs to array
  nodes.forEach((node) => {
    const svgNodeHash = _getHashFromSvgElement(node)

    if (!annotationUIDs[svgNodeHash]) {
      annotationUIDs.push(svgNodeHash)
    }
  })

  return annotationUIDs
}

/**
 *
 * @param canvasElement
 * @private
 */
function _getSvgLayer(canvasElement) {
  const parentElement = canvasElement.parentNode
  const svgLayer = parentElement.querySelector('.svg-layer')

  return svgLayer
}

export default getSvgDrawingHelper
