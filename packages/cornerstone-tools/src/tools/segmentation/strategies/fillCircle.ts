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
import {
  getBoundingBoxAroundShape,
  triggerLabelmapRender,
} from '../../../util/segmentation'
import { pointInShapeCallback } from '../../../util/planar'

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
    <Point3>worldToIndex(vtkImageData, topLeftWorld),
    <Point3>worldToIndex(vtkImageData, bottomRightWorld),
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
    vtkImageData,
    dimensions,
    (pointLPS, pointIJK) => pointInEllipse(ellipseObj, pointLPS),
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
