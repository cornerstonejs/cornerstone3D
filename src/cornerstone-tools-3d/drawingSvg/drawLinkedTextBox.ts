import drawTextBox from './drawTextBox'
import { Point2, ToolStateTextBox } from './../types'
import drawLink from './drawLink'

export default function (
  svgDrawingHelper: any,
  //
  toolUID: string,
  annotationUID: string,
  textBoxUID: string,
  //
  textLines: Array<string>,
  textBoxPosition: Point2,
  annotationAnchorPoints: Array<Point2>,
  textBox: ToolStateTextBox,
  options = {}
  // TODO: yCenter as an option
) {
  const mergedOptions = Object.assign(
    {},
    {
      color: 'dodgerblue',
      handleRadius: '6',
      width: '2',
      centering: {
        x: false,
        y: true, // yCenter,
      },
    },
    options
  )

  // Draw the text box
  const canvasBoundingBox = drawTextBox(
    svgDrawingHelper,
    toolUID,
    annotationUID,
    textBoxUID,
    textLines,
    textBoxPosition,
    mergedOptions
  )
  // if (textBox.hasMoved) {
  //   // Draw dashed link line between tool and text
  drawLink(
    svgDrawingHelper,
    toolUID,
    annotationUID,
    textBoxUID,
    annotationAnchorPoints, // annotationAnchorPoints
    textBoxPosition, // refPoint (text)
    canvasBoundingBox, // textBoxBoundingBox
    mergedOptions
  )
  // }

  // const { top, left, width, height } = canvasBoundingBox

  // textBox.worldBoundingBox = {
  //   topLeft: canvasToWorld([left, top]),
  //   topRight: canvasToWorld([left + width, top]),
  //   bottomLeft: canvasToWorld([left, top + height]),
  //   bottomRight: canvasToWorld([left + width, top + height]),
  // }
}
