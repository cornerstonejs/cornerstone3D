import { getBoundingBoxAroundShape } from '../../../util/segmentation'
import { Point3 } from '../../../types'
import { ImageVolume } from '@precisionmetrics/cornerstone-render'
import { IEnabledElement } from '@precisionmetrics/cornerstone-render/src/types'
import triggerLabelmapRender from '../../../util/segmentation/triggerLabelmapRender'
import pointInShapeCallback from '../../../util/planar/pointInShapeCallback'

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
  const { renderingEngine, viewport } = enabledElement
  const { volume: labelmapVolume, points, segmentsLocked } = operationData
  const { vtkImageData, dimensions, scalarData } = labelmapVolume

  const rectangleCornersIJK = points.map((world) => {
    return vtkImageData.worldToIndex(world)
  })

  const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet')
  }

  // Since always all points inside the boundsIJK is inside the rectangle...
  const pointInShape = () => true

  const callback = (canvasCoords, pointIJK, index, value) => {
    if (segmentsLocked.includes(value)) {
      return
    }
    scalarData[index] = 0
  }

  pointInShapeCallback(
    boundsIJK,
    viewport.worldToCanvas,
    scalarData,
    vtkImageData,
    dimensions,
    pointInShape,
    callback
  )

  triggerLabelmapRender(renderingEngine, labelmapVolume, vtkImageData)
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
