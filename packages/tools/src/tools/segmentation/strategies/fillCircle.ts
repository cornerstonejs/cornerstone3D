import { vec3 } from 'gl-matrix'
import type { Types } from '@cornerstonejs/core'

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../utilities/math/ellipse'
import { getBoundingBoxAroundShape } from '../../../utilities/segmentation'
import transformPhysicalToIndex from '../../../utilities/transformPhysicalToIndex'
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents'
import { pointInShapeCallback } from '../../../utilities'

type OperationData = {
  segmentationId: string
  points: any // Todo:fix
  volume: Types.IImageVolume
  segmentIndex: number
  segmentsLocked: number[]
  viewPlaneNormal: number[]
  viewUp: number[]
  constraintFn: () => boolean
}

function fillCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  inside = true
): void {
  const {
    volume: segmentationVolume,
    points,
    segmentsLocked,
    segmentIndex,
    segmentationId,
  } = operationData
  const { imageData, dimensions, scalarData } = segmentationVolume
  const { viewport } = enabledElement

  // Average the points to get the center of the ellipse
  const center = vec3.fromValues(0, 0, 0)
  points.forEach((point) => {
    vec3.add(center, center, point)
  })
  vec3.scale(center, center, 1 / points.length)

  const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))

  // 1. From the drawn tool: Get the ellipse (circle) topLeft and bottomRight
  // corners in canvas coordinates
  const [topLeftCanvas, bottomRightCanvas] =
    getCanvasEllipseCorners(canvasCoordinates)

  // 2. Find the extent of the ellipse (circle) in IJK index space of the image
  const topLeftWorld = viewport.canvasToWorld(topLeftCanvas)
  const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas)

  const ellipsoidCornersIJK = [
    <Types.Point3>transformPhysicalToIndex(imageData, topLeftWorld),
    <Types.Point3>transformPhysicalToIndex(imageData, bottomRightWorld),
  ]

  const boundsIJK = getBoundingBoxAroundShape(ellipsoidCornersIJK, dimensions)

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet')
  }

  // using circle as a form of ellipse
  const ellipseObj = {
    center: center as Types.Point3,
    xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
    yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
    zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
  }

  const callback = ({ value, index }) => {
    if (segmentsLocked.includes(value)) {
      return
    }
    scalarData[index] = segmentIndex
  }

  pointInShapeCallback(
    imageData,
    (pointLPS, pointIJK) => pointInEllipse(ellipseObj, pointLPS),
    callback,
    boundsIJK
  )

  triggerSegmentationDataModified(segmentationId)
}

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillInsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillCircle(enabledElement, operationData, true)
}

/**
 * Fill outside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels outside the  defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillOutsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillCircle(enabledElement, operationData, false)
}
