import {
  fillInsideShape,
  getBoundingBoxAroundShape,
} from '../../../util/segmentation'
import { Point3 } from '../../../types'
import { ImageVolume, Types } from '@ohif/cornerstone-render'

type OperationData = {
  points: [Point3, Point3, Point3, Point3]
  labelmap: ImageVolume
  segmentIndex: number
  segmentsLocked: number[]
}

type FillRectangleEvent = {
  enabledElement: Types.IEnabledElement
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
  inside = true
): void {
  const { labelmap, points } = operationData
  const { vtkImageData } = labelmap

  const rectangleCornersIJK = points.map((world) => {
    return vtkImageData.worldToIndex(world)
  })

  const [[xMin, xMax], [yMin, yMax], [zMin, zMax]] = getBoundingBoxAroundShape(
    rectangleCornersIJK,
    vtkImageData
  )

  const topLeftFront = [xMin, yMin, zMin]
  const bottomRightBack = [xMax, yMax, zMax]

  inside
    ? fillInsideShape(
        evt,
        operationData,
        () => true,
        topLeftFront,
        bottomRightBack
      )
    : null //fillOutsideBoundingBox(evt, operationData, topLeftFront, bottomRightBack)
}

/**
 * Fill all pixels inside/outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillInsideRectangle(
  evt: FillRectangleEvent,
  operationData: OperationData
): void {
  fillRectangle(evt, operationData, true)
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
  operationData: OperationData
): void {
  fillRectangle(evt, operationData, false)
}
