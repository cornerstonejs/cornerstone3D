import type {
  Types,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'

import { triggerSegmentationDataModified } from '../../../store/SegmentationModule/triggerSegmentationEvents'
import { pointInSurroundingSphereCallback } from '../../../utilities'

type OperationData = {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3]
  volume: Types.IImageVolume
  toolGroupUID: string
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
    toolGroupUID,
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
    viewport as VolumeViewport,
    imageData,
    [points[0], points[1]],
    callback
  )

  triggerSegmentationDataModified(toolGroupUID, segmentationDataUID)
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
