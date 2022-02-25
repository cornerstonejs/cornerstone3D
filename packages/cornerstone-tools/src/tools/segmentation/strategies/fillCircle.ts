import { vec3 } from 'gl-matrix'
import {
  Point3,
  IImageVolume,
  IEnabledElement,
} from '@precisionmetrics/cornerstone-render/src/types'

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../util/math/ellipse'
import { getBoundingBoxAroundShape } from '../../../util/segmentation'
import { triggerSegmentationDataModified } from '../../../store/SegmentationModule/triggerSegmentationEvents'
import { pointInShapeCallback } from '../../../util/planar'

type OperationData = {
  toolGroupUID: string
  segmentationDataUID: string
  points: any // Todo:fix
  volume: IImageVolume
  segmentIndex: number
  segmentsLocked: number[]
  viewPlaneNormal: number[]
  viewUp: number[]
  constraintFn: () => boolean
}

// Todo: i don't think we need this we can use indexToWorldVec3
function worldToIndex(imageData, ain) {
  const vout = vec3.fromValues(0, 0, 0)
  imageData.worldToIndex(ain, vout)
  return vout
}

function fillCircle(
  enabledElement: IEnabledElement,
  operationData: OperationData,
  inside = true
): void {
  const {
    volume: segmentationVolume,
    points,
    segmentsLocked,
    segmentIndex,
    toolGroupUID,
    segmentationDataUID,
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
    <Point3>worldToIndex(imageData, topLeftWorld),
    <Point3>worldToIndex(imageData, bottomRightWorld),
  ]

  const boundsIJK = getBoundingBoxAroundShape(ellipsoidCornersIJK, dimensions)

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet')
  }

  // using circle as a form of ellipse
  const ellipseObj = {
    center: center,
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
    boundsIJK,
    scalarData,
    imageData,
    dimensions,
    (pointLPS, pointIJK) => pointInEllipse(ellipseObj, pointLPS),
    callback
  )

  triggerSegmentationDataModified(toolGroupUID, segmentationDataUID)
}

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param {EraseOperationData} operationData - EraseOperationData
 */
export function fillInsideCircle(
  enabledElement: IEnabledElement,
  operationData: OperationData
): void {
  fillCircle(enabledElement, operationData, true)
}

/**
 * Fill outside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels outside the  defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param {EraseOperationData} operationData - EraseOperationData
 */
export function fillOutsideCircle(
  enabledElement: IEnabledElement,
  operationData: OperationData
): void {
  fillCircle(enabledElement, operationData, false)
}
