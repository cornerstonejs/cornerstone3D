import _getHash from './_getHash'
import { Point2 } from '../types'

export default function drawLine(
  svgDrawingHelper: any,
  toolUID: string,
  annotationUID: string,
  lineUID: string,
  start: Point2,
  end: Point2,
  options = {}
): void {
  // if length is NaN return
  if (!start[0] || !start[1] || !end[0] || !end[1]) {
    return
  }

  const { color, width, lineWidth, lineDash } = Object.assign(
    {
      color: 'dodgerblue',
      width: '2',
      lineWidth: undefined,
      lineDash: undefined,
    },
    options
  )

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width

  const svgns = 'http://www.w3.org/2000/svg'
  const svgNodeHash = _getHash(toolUID, annotationUID, 'line', lineUID)
  const existingLine = svgDrawingHelper._getSvgNode(svgNodeHash)

  if (existingLine) {
    existingLine.setAttribute('x1', `${start[0]}`)
    existingLine.setAttribute('y1', `${start[1]}`)
    existingLine.setAttribute('x2', `${end[0]}`)
    existingLine.setAttribute('y2', `${end[1]}`)
    existingLine.setAttribute('stroke', color)
    existingLine.setAttribute('stroke-width', strokeWidth)

    if (lineDash) {
      existingLine.setAttribute('stroke-dasharray', lineDash)
    } else {
      existingLine.removeAttribute('stroke-dasharray')
    }

    svgDrawingHelper._setNodeTouched(svgNodeHash)
  } else {
    const newLine = document.createElementNS(svgns, 'line')

    newLine.setAttribute('x1', `${start[0]}`)
    newLine.setAttribute('y1', `${start[1]}`)
    newLine.setAttribute('x2', `${end[0]}`)
    newLine.setAttribute('y2', `${end[1]}`)
    newLine.setAttribute('stroke', color)
    newLine.setAttribute('stroke-width', strokeWidth)

    if (lineDash) {
      newLine.setAttribute('stroke-dasharray', lineDash)
    }

    svgDrawingHelper._appendNode(newLine, svgNodeHash)
  }
}
