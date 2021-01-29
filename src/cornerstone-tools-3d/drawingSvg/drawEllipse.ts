import _getHash from './_getHash'
import { Point2 } from './../types'

function drawEllipse(
  svgDrawingHelper: any,
  toolUID: string,
  annotationUID: string,
  ellipseUID: string,
  corner1: Point2,
  corner2: Point2,
  options = {}
) {
  const { color, lineWidth, lineDash } = Object.assign(
    {},
    {
      color: 'dodgerblue',
      lineWidth: '2',
      lineDash: undefined,
    },
    options
  )

  const svgns = 'http://www.w3.org/2000/svg'
  const svgNodeHash = _getHash(toolUID, annotationUID, 'ellipse', ellipseUID)
  const existingEllipse = svgDrawingHelper._getSvgNode(svgNodeHash)

  const w = Math.abs(corner1[0] - corner2[0])
  const h = Math.abs(corner1[1] - corner2[1])
  const xMin = Math.min(corner1[0], corner2[0])
  const yMin = Math.min(corner1[1], corner2[1])

  const center = [xMin + w / 2, yMin + h / 2]
  const radiusX = w / 2
  const radiusY = h / 2

  if (existingEllipse) {
    existingEllipse.setAttribute('cx', `${center[0]}`)
    existingEllipse.setAttribute('cy', `${center[1]}`)
    existingEllipse.setAttribute('rx', `${radiusX}`)
    existingEllipse.setAttribute('ry', `${radiusY}`)
    existingEllipse.setAttribute('stroke', color)
    existingEllipse.setAttribute('stroke-width', lineWidth)

    svgDrawingHelper._setNodeTouched(svgNodeHash)
  } else {
    const svgEllipseElement = document.createElementNS(svgns, 'ellipse')

    svgEllipseElement.setAttribute('cx', `${center[0]}`)
    svgEllipseElement.setAttribute('cy', `${center[1]}`)
    svgEllipseElement.setAttribute('rx', `${radiusX}`)
    svgEllipseElement.setAttribute('ry', `${radiusY}`)
    svgEllipseElement.setAttribute('fill', 'transparent')
    svgEllipseElement.setAttribute('stroke', color)
    svgEllipseElement.setAttribute('stroke-width', lineWidth)

    if (lineDash) {
      svgEllipseElement.setAttribute('stroke-dasharray', lineDash)
    }

    svgDrawingHelper._appendNode(svgEllipseElement, svgNodeHash)
  }
}

export default drawEllipse
