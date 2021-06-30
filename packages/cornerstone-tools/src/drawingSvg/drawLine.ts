import _getHash from './_getHash'
import _setNewAttributesIfValid from './_setNewAttributesIfValid'
import _setAttributesIfNecessary from './_setAttributesIfNecessary'
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

  const attributes = {
    x1: `${start[0]}`,
    y1: `${start[1]}`,
    x2: `${end[0]}`,
    y2: `${end[1]}`,
    stroke: color,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash
  }

  if (existingLine) {
    // This is run to avoid re-rendering annotations that actually haven't changed
    _setAttributesIfNecessary(attributes, existingLine)

    svgDrawingHelper._setNodeTouched(svgNodeHash)
  } else {
    const newLine = document.createElementNS(svgns, 'line')

    _setNewAttributesIfValid(attributes, newLine)

    svgDrawingHelper._appendNode(newLine, svgNodeHash)
  }
}
