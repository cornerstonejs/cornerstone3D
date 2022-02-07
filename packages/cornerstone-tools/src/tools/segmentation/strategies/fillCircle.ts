import {
  fillInsideShape,
  getBoundingBoxAroundShape,
} from '../../../util/segmentation'
import { pointInEllipse } from '../../../util/math/ellipse'
import { ImageVolume, Types } from '@ohif/cornerstone-render'
import { getCanvasEllipseCorners } from '../../../util/math/ellipse'

type OperationData = {
  points: any // Todo:fix
  labelmap: ImageVolume
  segmentIndex: number
  segmentsLocked: number[]
  viewPlaneNormal: number[]
  viewUp: number[]
  constraintFn: any
}

type fillCircleEvent = {
  enabledElement: Types.IEnabledElement
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
  const { labelmap, points, constraintFn } = operationData
  const { vtkImageData } = labelmap
  const { enabledElement } = evt
  const { viewport } = enabledElement

  const { bottom, top, left, right } = points

  // 1. From the drawn tool: Get the ellipse (circle) topLeft and bottomRight corners in canvas coordinates
  const [topLeftCanvas, bottomRightCanvas] = getCanvasEllipseCorners([
    bottom.canvas,
    top.canvas,
    left.canvas,
    right.canvas,
  ])

  const ellipse = {
    left: Math.min(topLeftCanvas[0], bottomRightCanvas[0]),
    top: Math.min(topLeftCanvas[1], bottomRightCanvas[1]),
    width: Math.abs(topLeftCanvas[0] - bottomRightCanvas[0]),
    height: Math.abs(topLeftCanvas[1] - bottomRightCanvas[1]),
  }

  // 2. Find the extent of the ellipse (circle) in IJK index space of the image
  const topLeftWorld = viewport.canvasToWorld(topLeftCanvas)
  const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas)

  const ellipsoidCornersIJK = [
    vtkImageData.worldToIndex(topLeftWorld),
    vtkImageData.worldToIndex(bottomRightWorld),
  ]

  const boundsIJK = getBoundingBoxAroundShape(ellipsoidCornersIJK, vtkImageData)
  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = boundsIJK

  const topLeftFrontIJK = [iMin, jMin, kMin]
  const bottomRightBackIJK = [iMax, jMax, kMax]

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet')
  }

  inside
    ? fillInsideShape(
        evt,
        operationData,
        (pointIJK, canvasCoords) => pointInEllipse(ellipse, canvasCoords), // Todo: we should call pointInEllipsoidWithConstraint for oblique planes
        constraintFn ? constraintFn : undefined,
        topLeftFrontIJK,
        bottomRightBackIJK
      )
    : null // fillOutsideBoundingBox(evt, operationData, topLeftFrontIJK, bottomRightBackIJK)
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
