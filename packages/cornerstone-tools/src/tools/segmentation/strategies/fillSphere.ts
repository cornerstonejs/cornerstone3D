import {
  Point3,
  Point2,
  IImageVolume,
  IEnabledElement,
} from '@precisionmetrics/cornerstone-render/src/types'

import triggerLabelmapRender from '../../../util/segmentation/triggerLabelmapRender'
import pointInSurroundingSphereCallback from '../../../util/planar/pointInSurroundingSphereCallback'

type OperationData = {
  points: [Point3, Point3, Point3, Point3]
  volume: IImageVolume
  segmentIndex: number
  segmentsLocked: number[]
  viewPlaneNormal: Point3
  viewUp: Point3
  constraintFn: () => boolean
}

type fillSphereEvent = {
  enabledElement: IEnabledElement
}

function fillSphere(
  evt: fillSphereEvent,
  operationData: OperationData,
  _inside = true
): void {
  const { enabledElement } = evt
  const { renderingEngine, viewport } = enabledElement
  const {
    volume: labelmapVolume,
    segmentsLocked,
    segmentIndex,
    points,
  } = operationData

  const { scalarData, vtkImageData } = labelmapVolume

  const callback = ({ index, value }) => {
    if (segmentsLocked.includes(value)) {
      return
    }
    scalarData[index] = segmentIndex
  }

  pointInSurroundingSphereCallback(
    viewport,
    labelmapVolume,
    [points[0], points[1]],
    callback
  )

  triggerLabelmapRender(renderingEngine, labelmapVolume, vtkImageData)
}

/**
 * Fill all pixels inside/outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillInsideSphere(
  evt: fillSphereEvent,
  operationData: OperationData
): void {
  fillSphere(evt, operationData, true)
}

/**
 * Fill all pixels outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param  {} operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillOutsideSphere(
  evt: fillSphereEvent,
  operationData: OperationData
): void {
  fillSphere(evt, operationData, false)
}
