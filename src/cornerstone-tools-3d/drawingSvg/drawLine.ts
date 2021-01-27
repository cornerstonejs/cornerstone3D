import _getHash from './_getHash'
import _setHashForSvgElement from './_setHashForSvgElement'
import { Point2 } from './../types'

// <line x1="5" y1="5" x2="100" y2="100" stroke="#765373" stroke-width="8"/>
export default function drawLine(
  svgDrawingHelper: any,
  toolUID: string,
  annotationUID: string,
  lineUID: string,
  start: Point2,
  end: Point2,
  options = {}
): void {
  const { color, width, lineDash } = Object.assign(
    {},
    {
      color: 'dodgerblue',
      width: '2',
      lineDash: undefined,
    },
    options
  )

  const svgns = 'http://www.w3.org/2000/svg'
  const svgNodeHash = _getHash(toolUID, annotationUID, 'line', lineUID)
  const existingLine = svgDrawingHelper._svgLayerElement.querySelector(
    `[data-tool-uid="${toolUID}"][data-annotation-uid="${annotationUID}"][data-drawing-element-type="line"][data-node-uid="${lineUID}"]`
  )

  svgDrawingHelper._drawnAnnotations[svgNodeHash] = true

  if (existingLine) {
    existingLine.setAttribute('x1', start[0])
    existingLine.setAttribute('y1', start[1])
    existingLine.setAttribute('x2', end[0])
    existingLine.setAttribute('y2', end[1])
    existingLine.setAttribute('stroke', color)
    existingLine.setAttribute('stroke-width', width)
  } else {
    const newLine = document.createElementNS(svgns, 'line')

    _setHashForSvgElement(newLine, toolUID, annotationUID, 'line', lineUID)
    newLine.setAttribute('x1', `${start[0]}`)
    newLine.setAttribute('y1', `${start[1]}`)
    newLine.setAttribute('x2', `${end[0]}`)
    newLine.setAttribute('y2', `${end[1]}`)
    newLine.setAttribute('stroke', color)
    newLine.setAttribute('stroke-width', width)

    if (lineDash) {
      newLine.setAttribute('stroke-dasharray', lineDash)
    }

    svgDrawingHelper._svgLayerElement.appendChild(newLine)
  }
}
