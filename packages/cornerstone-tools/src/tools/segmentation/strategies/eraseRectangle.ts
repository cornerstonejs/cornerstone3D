import {
  fillInsideShape,
  getBoundingBoxAroundShape,
} from '../../../util/segmentation'
import { Point3 } from '../../../types'
import { ImageVolume } from '@ohif/cornerstone-render'
import { IEnabledElement } from '@ohif/cornerstone-render/src/types'

type EraseOperationData = {
  points: [Point3, Point3, Point3, Point3]
  volume: ImageVolume
  constraintFn: (x: [number, number, number]) => boolean
  segmentsLocked: number[]
}

type FillRectangleEvent = {
  enabledElement: IEnabledElement
}

/**
 * eraseRectangle - Erases all pixels inside/outside the region defined
 * by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
function eraseRectangle(
  evt: FillRectangleEvent,
  operationData: EraseOperationData,
  inside = true
): void {
  const { enabledElement } = evt
  const { renderingEngine } = enabledElement
  const { volume: labelmapVolume, points, constraintFn } = operationData
  const { vtkImageData, dimensions } = labelmapVolume

  const rectangleCornersIJK = points.map((world) => {
    return vtkImageData.worldToIndex(world)
  })

  const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet')
  }

  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = boundsIJK

  const topLeftFront = <Point3>[iMin, jMin, kMin]
  const bottomRightBack = <Point3>[iMax, jMax, kMax]

  // Since always all points inside the boundsIJK is inside the rectangle...
  const pointInShape = () => true
  const options = Object.assign({}, operationData, { segmentIndex: 0 })

  inside
    ? fillInsideShape(
        enabledElement,
        options,
        pointInShape,
        constraintFn,
        topLeftFront,
        bottomRightBack
      )
    : null //fillOutsideBoundingBox(evt, operationData, topLeftFront, bottomRightBack)

  // todo: this renders all viewports, only renders viewports that have the modified labelmap actor
  // right now this is needed to update the labelmap on other viewports that have it (pt)
  renderingEngine.render()
}

/**
 * Erases all pixels inside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function eraseInsideRectangle(
  evt: FillRectangleEvent,
  operationData: EraseOperationData
): void {
  eraseRectangle(evt, operationData, true)
}

/**
 * Erases all pixels outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param  {} operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function eraseOutsideRectangle(
  evt: FillRectangleEvent,
  operationData: EraseOperationData
): void {
  eraseRectangle(evt, operationData, false)
}
