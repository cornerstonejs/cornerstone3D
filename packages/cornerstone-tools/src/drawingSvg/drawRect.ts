import _getHash from './_getHash'
import { Point2 } from '../types'

// <rect x="120" y="100" width="100" height="100" />
export default function drawRect(
  svgDrawingHelper: any,
  toolUID: string,
  annotationUID: string,
  rectangleUID: string,
  start: Point2,
  end: Point2,
  options = {}
): void {
  const { color, width: _width, lineWidth, lineDash } = Object.assign(
    {
      color: 'dodgerblue',
      width: '2',
      lineWidth: undefined,
      lineDash: undefined,
    },
    options
  )

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || _width

  const svgns = 'http://www.w3.org/2000/svg'
  const svgNodeHash = _getHash(toolUID, annotationUID, 'rect', rectangleUID)
  const existingRect = svgDrawingHelper._getSvgNode(svgNodeHash)

  const tlhc = [Math.min(start[0], end[0]), Math.min(start[1], end[1])]
  const width = Math.abs(start[0] - end[0])
  const height = Math.abs(start[1] - end[1])

  if (existingRect) {
    existingRect.setAttribute('x', `${tlhc[0]}`)
    existingRect.setAttribute('y', `${tlhc[1]}`)
    existingRect.setAttribute('width', `${width}`)
    existingRect.setAttribute('height', `${height}`)
    existingRect.setAttribute('stroke', color)
    existingRect.setAttribute('stroke-width', strokeWidth)

    if (lineDash) {
      existingRect.setAttribute('stroke-dasharray', lineDash)
    } else {
      existingRect.removeAttribute('stroke-dasharray')
    }

    svgDrawingHelper._setNodeTouched(svgNodeHash)
  } else {
    const svgRectElement = document.createElementNS(svgns, 'rect')

    svgRectElement.setAttribute('x', `${tlhc[0]}`)
    svgRectElement.setAttribute('y', `${tlhc[1]}`)
    svgRectElement.setAttribute('width', `${width}`)
    svgRectElement.setAttribute('height', `${height}`)
    svgRectElement.setAttribute('fill', 'transparent')
    svgRectElement.setAttribute('stroke', color)
    svgRectElement.setAttribute('stroke-width', strokeWidth)

    if (lineDash) {
      svgRectElement.setAttribute('stroke-dasharray', lineDash)
    }

    svgDrawingHelper._appendNode(svgRectElement, svgNodeHash)
  }
}
