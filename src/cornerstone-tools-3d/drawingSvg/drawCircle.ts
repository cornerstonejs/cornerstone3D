// path(context, options, context => {
//   context.arc(center[0], center[1], radius, 0, 2 * Math.PI);
// });
import _getHash from './_getHash'
import _setHashForSvgElement from './_setHashForSvgElement'
import { Point2 } from './../types'

export default function (
  svgDrawingHelper: any,
  toolUID: string,
  annotationUID: string,
  circleUID: string,
  center: Point2,
  radius: number,
  options = {}
): void {
  const { color, fill, width } = Object.assign(
    {},
    {
      color: 'dodgerblue',
      fill: 'transparent',
      width: 2,
    },
    options
  )

  // variable for the namespace
  const svgns = 'http://www.w3.org/2000/svg'
  const svgNodeHash = _getHash(toolUID, annotationUID, 'circle', circleUID)
  const existingCircleElement = svgDrawingHelper._svgLayerElement.querySelector(
    `[data-tool-uid="${toolUID}"][data-annotation-uid="${annotationUID}"][data-drawing-element-type="circle"][data-node-uid="hg-${circleUID}"]`
  )
  svgDrawingHelper._drawnAnnotations[svgNodeHash] = true

  if (existingCircleElement) {
    existingCircleElement.setAttribute('cx', `${center[0]}`)
    existingCircleElement.setAttribute('cy', `${center[1]}`)
    existingCircleElement.setAttribute('r', `${radius}`)
    existingCircleElement.setAttribute('stroke', color)
    existingCircleElement.setAttribute('fill', fill)
    existingCircleElement.setAttribute('stroke-width', `${width}`)
  } else {
    const newCircleElement = document.createElementNS(svgns, 'circle')

    _setHashForSvgElement(
      newCircleElement,
      toolUID,
      annotationUID,
      'circle',
      circleUID
    )
    newCircleElement.setAttribute('cx', `${center[0]}`)
    newCircleElement.setAttribute('cy', `${center[1]}`)
    newCircleElement.setAttribute('r', `${radius}`)
    newCircleElement.setAttribute('stroke', color)
    newCircleElement.setAttribute('fill', fill)
    newCircleElement.setAttribute('stroke-width', `${width}`)

    svgDrawingHelper._svgLayerElement.appendChild(newCircleElement)
  }
}
