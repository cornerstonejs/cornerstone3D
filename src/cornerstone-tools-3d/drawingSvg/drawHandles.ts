import _getHash from './_getHash'
import _setHashForSvgElement from './_setHashForSvgElement'
import toolStyle from './../stateManagement/toolStyle'
import toolColors from './../stateManagement/toolColors'
import { state } from '../store'
import { Point2 } from './../types'

export default function (
  svgDrawingHelper: any,
  toolUID: string,
  annotationUID: string,
  handlePoints: Array<Point2>,
  options = {}
): void {
  const { color, handleRadius, width } = Object.assign(
    {},
    {
      color: 'dodgerblue',
      handleRadius: '6',
      width: '2',
    },
    options
  )

  for (let i = 0; i < handlePoints.length; i++) {
    const handle = handlePoints[i]

    // variable for the namespace
    const svgns = 'http://www.w3.org/2000/svg'
    const svgNodeHash = _getHash(toolUID, annotationUID, 'handle', `${i}`)
    const existingHandleElement = svgDrawingHelper._svgLayerElement.querySelector(
      `[data-tool-uid="${toolUID}"][data-annotation-uid="${annotationUID}"][data-drawing-element-type="handle"][data-node-uid="${i}"]`
    )
    svgDrawingHelper._drawnAnnotations[svgNodeHash] = true

    if (existingHandleElement) {
      existingHandleElement.setAttribute('cx', `${handle[0]}`)
      existingHandleElement.setAttribute('cy', `${handle[1]}`)
      existingHandleElement.setAttribute('r', handleRadius)
      existingHandleElement.setAttribute('stroke', color)
      existingHandleElement.setAttribute('fill', 'transparent')
      existingHandleElement.setAttribute('stroke-width', width)
    } else {
      const newHandleElement = document.createElementNS(svgns, 'circle')

      _setHashForSvgElement(
        newHandleElement,
        toolUID,
        annotationUID,
        'handle',
        `${i}`
      )
      newHandleElement.setAttribute('cx', `${handle[0]}`)
      newHandleElement.setAttribute('cy', `${handle[1]}`)
      newHandleElement.setAttribute('r', handleRadius)
      newHandleElement.setAttribute('stroke', color)
      newHandleElement.setAttribute('fill', 'transparent')
      newHandleElement.setAttribute('stroke-width', width)

      svgDrawingHelper._svgLayerElement.appendChild(newHandleElement)
    }
  }
}
