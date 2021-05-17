import _getHash from './_getHash'
import { Point2 } from '../types'

/**
 * Draws a textBox.
 *
 * @param textLines   The text to display.
 * @param position    The x/y position of the textbox
 * @param options     Options for the textBox.
 * @returns Bounding box; can be used for pointNearTool
 */
function drawTextBox(
  svgDrawingHelper: Record<string, unknown>,
  toolUID: string,
  annotationUID: string,
  textUID: string,
  textLines: Array<string>,
  position: Point2,
  options = {}
): SVGRect {
  const mergedOptions = Object.assign(
    {
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '14px',
      color: 'rgb(255, 255, 0)',
      background: '',
      padding: 25,
      centerX: false,
      centerY: true,
    },
    options
  )

  // Draw each of the text lines on top of the background box
  const textGroupBoundingBox = _drawTextGroup(
    svgDrawingHelper,
    toolUID,
    annotationUID,
    textUID,
    textLines,
    position,
    mergedOptions
  )

  // let [x, y] = position

  // // Draw the background box with padding
  // if (centerX === true) {
  //   x -= textGroupBoundingBox.width / 2
  // }

  // if (centerY === true) {
  //   y -= textGroupBoundingBox.height / 2
  // }
  // TODO: Must be under text nodes
  // Rectangle....
  // fillBox(boundingBox, fillStyle)
  return textGroupBoundingBox
}

function _drawTextGroup(
  svgDrawingHelper: any,
  toolUID: any,
  annotationUID: string,
  textUID: string,
  textLines: Array<string>,
  position: Point2,
  options: any
): DOMRect {
  const { padding, color, fontFamily, fontSize, background } = options

  let textGroupBoundingBox
  const [x, y] = [position[0] + padding, position[1] + padding]
  const svgns = 'http://www.w3.org/2000/svg'
  const svgNodeHash = _getHash(toolUID, annotationUID, 'text', textUID)
  const existingTextGroup = svgDrawingHelper._getSvgNode(svgNodeHash)

  if (existingTextGroup) {
    existingTextGroup.setAttribute('transform', `translate(${x} ${y})`)
    // TODO: Iterate each node and update color? font-size?
    // TODO: Does not support change in # of text lines
    const textElement = existingTextGroup.querySelector('text')
    const textSpans = Array.from(textElement.children) as Array<SVGElement>

    for (let i = 0; i < textSpans.length; i++) {
      const textSpanElement = textSpans[i]
      const text = textLines[i] || ''

      textSpanElement.textContent = text
    }

    if (fontFamily) {
      textElement.setAttribute('font-family', fontFamily)
    } else {
      textElement.removeAttribute('font-family')
    }

    if (fontSize) {
      textElement.setAttribute('font-size', fontSize)
    } else {
      textElement.removeAttribute('font-size')
    }

    if (color) {
      textElement.setAttribute('fill', color)
    } else {
      textElement.removeAttribute('fill')
    }

    _drawTextBackground(existingTextGroup, background)
    textGroupBoundingBox = existingTextGroup.getBBox()
    svgDrawingHelper._setNodeTouched(svgNodeHash)
  } else {
    const textGroup = document.createElementNS(svgns, 'g')

    textGroup.setAttribute('transform', `translate(${x} ${y})`)

    //
    const textElement = _createTextElement(options)
    for (let i = 0; i < textLines.length; i++) {
      const textLine = textLines[i]
      const textSpan = _createTextSpan(textLine)

      textElement.appendChild(textSpan)
    }

    textGroup.appendChild(textElement)
    svgDrawingHelper._appendNode(textGroup, svgNodeHash)
    _drawTextBackground(textGroup, background)
    textGroupBoundingBox = textGroup.getBBox()
  }

  // We translate the group using `position`
  // which means we also need to pluck those values when returning
  // the bounding box
  return Object.assign({}, textGroupBoundingBox, {
    x,
    y,
    height: textGroupBoundingBox.height + padding,
    width: textGroupBoundingBox.width + padding,
  })
}

function _createTextElement(options: any): SVGElement {
  const { color, fontFamily, fontSize } = options
  const svgns = 'http://www.w3.org/2000/svg'
  const textElement = document.createElementNS(svgns, 'text')
  const noSelectStyle =
    'user-select: none; pointer-events: none; -webkit-tap-highlight-color:  rgba(255, 255, 255, 0);'
  const dropShadowStyle = 'filter:url(#shadow);'
  const combinedStyle = `${noSelectStyle}${dropShadowStyle}`

  // font-size="100"
  textElement.setAttribute('x', '0')
  textElement.setAttribute('y', '0')
  textElement.setAttribute('fill', color)
  textElement.setAttribute('font-family', fontFamily)
  textElement.setAttribute('font-size', fontSize)
  textElement.setAttribute('style', combinedStyle)

  return textElement
}

function _createTextSpan(text): SVGElement {
  const svgns = 'http://www.w3.org/2000/svg'
  const textSpanElement = document.createElementNS(svgns, 'tspan')

  // TODO: centerX
  // (parent width / 2) - my width
  // TODO: centerY

  textSpanElement.setAttribute('x', '0')
  textSpanElement.setAttribute('dy', '1.2em')
  textSpanElement.textContent = text

  return textSpanElement
}

function _drawTextBackground(group: SVGGElement, color: string): void {
  let element = group.querySelector('rect.background')
  if (color) {
    if (!element) {
      element = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      element.setAttribute('class', 'background')
      group.insertBefore(element, group.firstChild)
    }
    const bBox = group.getBBox()
    element.setAttribute('x', `${bBox.x}`)
    element.setAttribute('y', `${bBox.y}`)
    element.setAttribute('width', `${bBox.width}`)
    element.setAttribute('height', `${bBox.height}`)
    element.setAttribute('fill', color)
  } else if (element) {
    group.removeChild(element)
  }
}

export default drawTextBox
