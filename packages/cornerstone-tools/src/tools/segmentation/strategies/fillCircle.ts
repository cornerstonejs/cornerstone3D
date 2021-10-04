import {
  fillInsideShape,
  getBoundingBoxAroundShape,
} from '../../../util/segmentation'
import { pointInEllipse3D } from '../../../util/math/ellipse'
import { Point3 } from '../../../types'
import { ImageVolume, Types } from '@ohif/cornerstone-render'
import { getWorldWidthAndHeightFromTwoPoints } from '../../../util/planar'

type OperationData = {
  points: any // Todo:fix
  labelmap: ImageVolume
  segmentIndex: number
  segmentsLocked: number[]
  viewPlaneNormal: number[]
  viewUp: number[]
}

type fillCircleEvent = {
  enabledElement: Types.IEnabledElement
}

function getCanvasEllipseCorners(canvasCoordinates): Array<Types.Point2> {
  const [bottom, top, left, right] = canvasCoordinates

  const topLeft = <Types.Point2>[left[0], top[1]]
  const bottomRight = <Types.Point2>[right[0], bottom[1]]

  return [topLeft, bottomRight]
}

/**
 * fillInsideCircle - Fill all pixels inside/outside the region defined
 * by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
function fillCircle(
  evt: fillCircleEvent,
  operationData: OperationData,
  inside = true
): void {
  const { labelmap, points, viewPlaneNormal, viewUp } = operationData
  const { vtkImageData } = labelmap
  const { enabledElement } = evt
  const { viewport } = enabledElement

  const { center, bottom, top, left, right } = points

  const [topLeftCanvas, bottomRightCanvas] = getCanvasEllipseCorners([
    bottom.canvas,
    top.canvas,
    left.canvas,
    right.canvas,
  ])

  const topLeftWorld = viewport.canvasToWorld(topLeftCanvas)
  const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas)

  const { worldWidth, worldHeight } = getWorldWidthAndHeightFromTwoPoints(
    viewPlaneNormal as Point3,
    viewUp as Point3,
    topLeftWorld,
    bottomRightWorld
  )

  const circleCornersIJK = [
    vtkImageData.worldToIndex(topLeftWorld),
    vtkImageData.worldToIndex(bottomRightWorld),
  ]

  const [[xMin, xMax], [yMin, yMax], [zMin, zMax]] = getBoundingBoxAroundShape(
    circleCornersIJK,
    vtkImageData
  )

  const topLeftFront = [xMin, yMin, zMin]
  const bottomRightBack = [xMax, yMax, zMax]

  // using circle as a form of ellipse
  const ellipse = {
    center: center.world,
    xRadius: worldWidth / 2,
    yRadius: worldHeight / 2,
  }

  inside
    ? fillInsideShape(
        evt,
        operationData,
        (pointIJK, pointLPS) =>
          pointInEllipse3D(
            ellipse,
            pointIJK,
            pointLPS,
            viewPlaneNormal as Point3
          ),
        topLeftFront,
        bottomRightBack
      )
    : null // fillOutsideBoundingBox(evt, operationData, topLeftFront, bottomRightBack)
}

/**
 * Fill all pixels inside/outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillInsideCircle(
  evt: fillCircleEvent,
  operationData: OperationData
): void {
  fillCircle(evt, operationData, true)
}

/**
 * Fill all pixels outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param  {} operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillOutsideCircle(
  evt: fillCircleEvent,
  operationData: OperationData
): void {
  fillCircle(evt, operationData, false)
}
