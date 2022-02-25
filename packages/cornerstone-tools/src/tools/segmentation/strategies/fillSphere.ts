import {
  Point3,
  IImageVolume,
  IEnabledElement,
} from '@precisionmetrics/cornerstone-render/src/types'

import { triggerSegmentationDataModified } from '../../../store/SegmentationModule/triggerSegmentationEvents'
import pointInSurroundingSphereCallback from '../../../util/planar/pointInSurroundingSphereCallback'

type OperationData = {
  points: [Point3, Point3, Point3, Point3]
  volume: IImageVolume
  toolGroupUID: string
  segmentIndex: number
  segmentationDataUID: string
  segmentsLocked: number[]
  viewPlaneNormal: Point3
  viewUp: Point3
  constraintFn: () => boolean
}

function fillSphere(
  enabledElement: IEnabledElement,
  operationData: OperationData,
  _inside = true
): void {
  const { viewport } = enabledElement
  const {
    volume: segmentation,
    segmentsLocked,
    segmentIndex,
    toolGroupUID,
    segmentationDataUID,
    points,
  } = operationData

  const { scalarData } = segmentation

  const callback = ({ index, value }) => {
    if (segmentsLocked.includes(value)) {
      return
    }
    scalarData[index] = segmentIndex
  }

  pointInSurroundingSphereCallback(
    viewport,
    segmentation,
    [points[0], points[1]],
    callback
  )

  triggerSegmentationDataModified(toolGroupUID, segmentationDataUID)
}

/**
 * Fill inside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param {IEnabledElement} enabledElement - The element that is enabled and
 * selected.
 * @param {OperationData} operationData - OperationData
 */
export function fillInsideSphere(
  enabledElement: IEnabledElement,
  operationData: OperationData
): void {
  fillSphere(enabledElement, operationData, true)
}

/**
 * Fill outside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param {IEnabledElement} enabledElement - The element that is enabled and
 * selected.
 * @param {OperationData} operationData - OperationData
 */
export function fillOutsideSphere(
  enabledElement: IEnabledElement,
  operationData: OperationData
): void {
  fillSphere(enabledElement, operationData, false)
}
