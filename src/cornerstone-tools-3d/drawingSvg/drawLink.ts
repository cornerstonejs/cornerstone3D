import drawLine from './drawLine'
import findClosestPoint from './../util/math/vec2/findClosestPoint'
import { PlanarBoundingBox, Point2 } from './../types'

/**
 * Draw a link between an annotation to a box.
 *
 * @param linkAnchorPoints Possible anchor points
 * @param refPoint         A reference point to select the anchor point
 * @param boundingBox      The bounding box to link
 * @param options
 * @returns {undefined}
 */
export default function (
  svgDrawingHelper: any,
  toolUID: string,
  annotationUID: string,
  linkUID: string,
  // Find closest point to approx. bounding box
  annotationAnchorPoints: Array<Point2>,
  refPoint: Point2,
  // Find bounding box point that's closest to our identified
  // start point
  boundingBox: PlanarBoundingBox,
  options: any = {}
): void {
  // The closest anchor point (for the annotation) to the
  // text box / bounding box
  const start =
    annotationAnchorPoints.length > 0
      ? findClosestPoint(annotationAnchorPoints, refPoint)
      : refPoint

  // Calculate the midpoints of the bounding box
  const boundingBoxPoints = _boundingBoxPoints(boundingBox)
  // Find the closest textBox midpoint to the annotation's anchor/start point
  const end = findClosestPoint(boundingBoxPoints, start)

  // Finally we draw the dashed linking line
  const defaultOptions = {
    lineDash: [2, 3],
  }
  const mergedOptions = Object.assign({}, defaultOptions, options)

  drawLine(
    svgDrawingHelper,
    toolUID,
    annotationUID,
    `link-${linkUID}`,
    start,
    end,
    mergedOptions
  )
}

/**
 * Find potential anchor points for a given bounding box. For example, it may
 * look nicer to draw a line from the "middle left" of a bounding box to an
 * annotation (instead of from a corner). This function calculates those points
 *
 * @param boundingBox
 */
function _boundingBoxPoints(boundingBox: PlanarBoundingBox): Array<Point2> {
  const { x: left, y: top, height, width } = boundingBox
  const halfWidth = width / 2
  const halfHeight = height / 2

  const topMiddle = [left + halfWidth, top] as Point2
  const leftMiddle = [left, top + halfHeight] as Point2
  const bottomMiddle = [left + halfWidth, top + height] as Point2
  const rightMiddle = [left + width, top + halfHeight] as Point2

  return [topMiddle, leftMiddle, bottomMiddle, rightMiddle]
}
