// <ellipse cx="200" cy="80" rx="100" ry="50"
import _getHash from './_getHash'
import _setHashForSvgElement from './_setHashForSvgElement'
import { Point2 } from './../types'

export default function (
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
  const existingEllipse = svgDrawingHelper._svgLayerElement.querySelector(
    `[data-tool-uid="${toolUID}"][data-annotation-uid="${annotationUID}"][data-drawing-element-type="ellipse"][data-node-uid="${ellipseUID}"]`
  )

  const w = Math.abs(corner1[0] - corner2[0])
  const h = Math.abs(corner1[1] - corner2[1])
  const xMin = Math.min(corner1[0], corner2[0])
  const yMin = Math.min(corner1[1], corner2[1])

  const center = [xMin + w / 2, yMin + h / 2]
  const radiusX = w / 2
  const radiusY = h / 2
  //  rotation, startAngle, endAngle [, anticlockwise]

  svgDrawingHelper._drawnAnnotations[svgNodeHash] = true

  if (existingEllipse) {
    // cx="200" cy="80" rx="100" ry="50"
    existingEllipse.setAttribute('cx', `${center[0]}`)
    existingEllipse.setAttribute('cy', `${center[1]}`)
    existingEllipse.setAttribute('rx', `${radiusX}`)
    existingEllipse.setAttribute('ry', `${radiusY}`)
    existingEllipse.setAttribute('stroke', color)
    existingEllipse.setAttribute('stroke-width', lineWidth)
  } else {
    const svgEllipseElement = document.createElementNS(svgns, 'ellipse')

    _setHashForSvgElement(
      svgEllipseElement,
      toolUID,
      annotationUID,
      'ellipse',
      ellipseUID
    )
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

    svgDrawingHelper._svgLayerElement.appendChild(svgEllipseElement)
  }
}
