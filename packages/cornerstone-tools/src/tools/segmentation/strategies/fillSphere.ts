import {
  Point3,
  Point2,
  IImageVolume,
  IEnabledElement,
} from '@precisionmetrics/cornerstone-render/src/types'

import triggerLabelmapRender from '../../../util/segmentation/triggerLabelmapRender'
import pointInSurroundingSphereCallback from '../../../util/planar/pointInSurroundingSphereCallback'

type CircleCanvasPoints = {
  bottom: {
    world: Point3
    canvas: Point2
  }
  top: {
    world: Point3
    canvas: Point2
  }
}

type OperationData = {
  points: CircleCanvasPoints
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
  const { renderingEngine } = enabledElement
  const {
    volume: labelmapVolume,
    segmentsLocked,
    segmentIndex,
    viewUp,
    viewPlaneNormal,
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
    labelmapVolume,
    { viewUp, viewPlaneNormal },
    points,
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
