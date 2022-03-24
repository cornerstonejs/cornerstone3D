import type { Types } from '@cornerstonejs/core'

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents'
import { pointInSurroundingSphereCallback } from '../../../utilities'

type OperationData = {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3]
  volume: Types.IImageVolume
  toolGroupId: string
  segmentIndex: number
  segmentationDataUID: string
  segmentsLocked: number[]
  viewPlaneNormal: Types.Point3
  viewUp: Types.Point3
  constraintFn: () => boolean
}

function fillSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  _inside = true
): void {
  const { viewport } = enabledElement
  const {
    volume: segmentation,
    segmentsLocked,
    segmentIndex,
    toolGroupId,
    segmentationDataUID,
    points,
  } = operationData

  const { scalarData, imageData } = segmentation

  const callback = ({ index, value }) => {
    if (segmentsLocked.includes(value)) {
      return
    }
    scalarData[index] = segmentIndex
  }

  pointInSurroundingSphereCallback(
    viewport as Types.IVolumeViewport,
    imageData,
    [points[0], points[1]],
    callback
  )

  triggerSegmentationDataModified(toolGroupId, segmentationDataUID)
}

/**
 * Fill inside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillInsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillSphere(enabledElement, operationData, true)
}

/**
 * Fill outside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillOutsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillSphere(enabledElement, operationData, false)
}
