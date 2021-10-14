import {
  Point3,
  IImageVolume,
  IEnabledElement,
} from '@ohif/cornerstone-render/src/types'

import { vec3 } from 'gl-matrix'
import {
  fillInsideShape,
  getBoundingBoxAroundShape,
} from '../../../util/segmentation'
import { pointInEllipse } from '../../../util/math/ellipse'
import { getCanvasEllipseCorners } from '../../../util/math/ellipse'

type OperationData = {
  points: any // Todo:fix
  volume: IImageVolume
  segmentIndex: number
  segmentsLocked: number[]
  viewPlaneNormal: number[]
  viewUp: number[]
  constraintFn: () => boolean
}

type fillCircleEvent = {
  enabledElement: IEnabledElement
}

function worldToIndex(imageData, ain) {
  const vout = vec3.fromValues(0, 0, 0)
  imageData.worldToIndex(ain, vout)
  return vout
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
  const { enabledElement } = evt
  const { volume: labelmapVolume, points, constraintFn } = operationData
  const { vtkImageData, dimensions } = labelmapVolume
  const { viewport, renderingEngine } = enabledElement

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
    <Point3>worldToIndex(vtkImageData, topLeftWorld),
    <Point3>worldToIndex(vtkImageData, bottomRightWorld),
  ]

  const boundsIJK = getBoundingBoxAroundShape(ellipsoidCornersIJK, dimensions)
  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = boundsIJK

  const topLeftFrontIJK = <Point3>[iMin, jMin, kMin]
  const bottomRightBackIJK = <Point3>[iMax, jMax, kMax]

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet')
  }

  inside
    ? fillInsideShape(
        enabledElement,
        operationData,
        (pointIJK, canvasCoords) => pointInEllipse(ellipse, canvasCoords), // Todo: we should call pointInEllipsoidWithConstraint for oblique planes
        constraintFn,
        topLeftFrontIJK,
        bottomRightBackIJK
      )
    : null // fillOutsideBoundingBox(evt, operationData, topLeftFrontIJK, bottomRightBackIJK)

  // todo: this renders all viewports, only renders viewports that have the modified labelmap actor
  // right now this is needed to update the labelmap on other viewports that have it (pt)
  renderingEngine.render()
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
