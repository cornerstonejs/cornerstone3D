import _getHash from './_getHash'
import toolStyle from './../stateManagement/toolStyle'
import toolColors from './../stateManagement/toolColors'
import { state } from '../store'
import { Point2 } from './../types'

function drawHandles(
  svgDrawingHelper: any,
  toolUID: string,
  annotationUID: string,
  handleGroupUID: string,
  handlePoints: Array<Point2>,
  options = {}
): void {
  const { color, handleRadius, width, fill, type } = Object.assign(
    {},
    {
      color: 'dodgerblue',
      handleRadius: '6',
      width: '2',
      fill: 'transparent',
      type: 'circle',
    },
    options
  )

  for (let i = 0; i < handlePoints.length; i++) {
    const handle = handlePoints[i]

    // variable for the namespace
    const svgns = 'http://www.w3.org/2000/svg'
    const svgNodeHash = _getHash(
      toolUID,
      annotationUID,
      'handle',
      `hg-${handleGroupUID}-index-${i}`
    )
    const existingHandleElement = svgDrawingHelper._getSvgNode(svgNodeHash)

    if (existingHandleElement) {
      if (type === 'circle') {
        existingHandleElement.setAttribute('cx', `${handle[0]}`)
        existingHandleElement.setAttribute('cy', `${handle[1]}`)
        existingHandleElement.setAttribute('r', handleRadius)
        existingHandleElement.setAttribute('stroke', color)
        existingHandleElement.setAttribute('fill', fill)
        existingHandleElement.setAttribute('stroke-width', width)
      } else if (type === 'rect') {
        const handleRadiusFloat = parseFloat(handleRadius)
        const side = handleRadiusFloat * 1.5
        const x = handle[0] - side * 0.5
        const y = handle[1] - side * 0.5
        existingHandleElement.setAttribute('x', `${x}`)
        existingHandleElement.setAttribute('y', `${y}`)
        existingHandleElement.setAttribute('width', `${side}`)
        existingHandleElement.setAttribute('height', `${side}`)
        existingHandleElement.setAttribute('stroke', color)
        existingHandleElement.setAttribute('fill', fill)
        existingHandleElement.setAttribute('stroke-width', width)
        existingHandleElement.setAttribute('rx', `${side * 0.1}`)
      }

      svgDrawingHelper._setNodeTouched(svgNodeHash)
    } else {
      const newHandleElement = document.createElementNS(svgns, type)

      if (type === 'circle') {
        newHandleElement.setAttribute('cx', `${handle[0]}`)
        newHandleElement.setAttribute('cy', `${handle[1]}`)
        newHandleElement.setAttribute('r', handleRadius)
        newHandleElement.setAttribute('stroke', color)
        newHandleElement.setAttribute('fill', fill)
        newHandleElement.setAttribute('stroke-width', width)
      } else if (type === 'rect') {
        const handleRadiusFloat = parseFloat(handleRadius)
        const side = handleRadiusFloat * 1.5
        const x = handle[0] - side * 0.5
        const y = handle[1] - side * 0.5
        newHandleElement.setAttribute('x', `${x}`)
        newHandleElement.setAttribute('y', `${y}`)
        newHandleElement.setAttribute('width', `${side}`)
        newHandleElement.setAttribute('height', `${side}`)
        newHandleElement.setAttribute('stroke', color)
        newHandleElement.setAttribute('fill', fill)
        newHandleElement.setAttribute('stroke-width', width)
        newHandleElement.setAttribute('rx', `${side * 0.1}`)
      } else {
        console.warn('handle type not valid')
      }

      svgDrawingHelper._appendNode(newHandleElement, svgNodeHash)
    }
  }
}

export default drawHandles
