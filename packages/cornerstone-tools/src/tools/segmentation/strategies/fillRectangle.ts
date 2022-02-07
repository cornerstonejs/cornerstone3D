import { IEnabledElement } from '@precisionmetrics/cornerstone-render/src/types'
import { getBoundingBoxAroundShape } from '../../../util/segmentation'
import { Point3 } from '../../../types'
import { ImageVolume } from '@precisionmetrics/cornerstone-render'
import pointInShapeCallback from '../../../util/planar/pointInShapeCallback'
import triggerLabelmapRender from '../../../util/segmentation/triggerLabelmapRender'

type OperationData = {
  points: [Point3, Point3, Point3, Point3]
  volume: ImageVolume
  constraintFn: (x: [number, number, number]) => boolean
  segmentIndex: number
  segmentsLocked: number[]
}

type FillRectangleEvent = {
  enabledElement: IEnabledElement
}

/**
 * FillInsideRectangle - Fill all pixels inside/outside the region defined
 * by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
function fillRectangle(
  evt: FillRectangleEvent,
  operationData: OperationData,
  constraintFn?: any,
  inside = true
): void {
  const { enabledElement } = evt
  const { renderingEngine, viewport } = enabledElement
  const {
    volume: labelmapVolume,
    points,
    segmentsLocked,
    segmentIndex,
  } = operationData
  const { vtkImageData, dimensions, scalarData } = labelmapVolume

  const rectangleCornersIJK = points.map((world) => {
    return vtkImageData.worldToIndex(world)
  })

  const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet')
  }

  // Since always all points inside the boundsIJK is inside the rectangle...
  const pointInRectangle = () => true

  const callback = ({ value, index, pointIJK }) => {
    if (segmentsLocked.includes(value)) {
      return
    }

    if (!constraintFn) {
      scalarData[index] = segmentIndex
      return
    }

    if (constraintFn(pointIJK)) {
      scalarData[index] = segmentIndex
    }
  }

  pointInShapeCallback(
    boundsIJK,
    scalarData,
    vtkImageData,
    dimensions,
    pointInRectangle,
    callback
  )

  triggerLabelmapRender(renderingEngine, labelmapVolume, vtkImageData)
}

/**
 * Fill all pixels inside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillInsideRectangle(
  evt: FillRectangleEvent,
  operationData: OperationData,
  constraintFn?: any
): void {
  fillRectangle(evt, operationData, constraintFn, true)
}

/**
 * Fill all pixels outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param  {} operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillOutsideRectangle(
  evt: FillRectangleEvent,
  operationData: OperationData,
  constraintFn?: any
): void {
  fillRectangle(evt, operationData, constraintFn, false)
}
