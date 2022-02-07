import {
  Point3,
  IImageVolume,
  IEnabledElement,
} from '@precisionmetrics/cornerstone-render/src/types'

import { vec3 } from 'gl-matrix'
import { getBoundingBoxAroundShape } from '../../../util/segmentation'
import { pointInEllipse } from '../../../util/math/ellipse'
import { getCanvasEllipseCorners } from '../../../util/math/ellipse'
import pointInShapeCallback from '../../../util/planar/pointInShapeCallback'
import triggerLabelmapRender from '../../../util/segmentation/triggerLabelmapRender'

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
  const {
    volume: labelmapVolume,
    points,
    segmentsLocked,
    segmentIndex,
  } = operationData
  const { vtkImageData, dimensions, scalarData } = labelmapVolume
  const { viewport, renderingEngine } = enabledElement

  const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))

  // 1. From the drawn tool: Get the ellipse (circle) topLeft and bottomRight corners in canvas coordinates
  const [topLeftCanvas, bottomRightCanvas] =
    getCanvasEllipseCorners(canvasCoordinates)

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

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet')
  }

  const callback = (canvasCoords, pointIJK, index, value) => {
    if (segmentsLocked.includes(value)) {
      return
    }
    scalarData[index] = segmentIndex
  }

  pointInShapeCallback(
    boundsIJK,
    viewport.worldToCanvas,
    scalarData,
    vtkImageData,
    dimensions,
    (canvasCoords) => pointInEllipse(ellipse, canvasCoords),
    callback
  )

  // Todo: optimize modified slices for all orthogonal views
  triggerLabelmapRender(renderingEngine, labelmapVolume, vtkImageData)
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
