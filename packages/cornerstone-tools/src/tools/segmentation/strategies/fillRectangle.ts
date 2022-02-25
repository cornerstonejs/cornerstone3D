import { getBoundingBoxAroundShape } from '../../../util/segmentation'
import { Point3 } from '../../../types'
import { ImageVolume, Types } from '@precisionmetrics/cornerstone-render'
import pointInShapeCallback from '../../../util/planar/pointInShapeCallback'
import { triggerSegmentationDataModified } from '../../../store/SegmentationModule/triggerSegmentationEvents'

type OperationData = {
  toolGroupUID: string
  segmentationDataUID: string
  points: [Point3, Point3, Point3, Point3]
  volume: ImageVolume
  constraintFn: (x: [number, number, number]) => boolean
  segmentIndex: number
  segmentsLocked: number[]
}

/**
 * For each point in the bounding box around the rectangle, if the point is inside
 * the rectangle, set the scalar value to the segmentIndex
 * @param {string} toolGroupUID - string
 * @param {OperationData} operationData - OperationData
 * @param {any} [constraintFn]
 * @param [inside=true] - boolean
 */
// Todo: why we have another constraintFn? in addition to the one in the operationData?
function fillRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  constraintFn?: any,
  inside = true
): void {
  const {
    volume: segmentation,
    points,
    segmentsLocked,
    segmentIndex,
    segmentationDataUID,
    toolGroupUID,
  } = operationData
  const { imageData, dimensions, scalarData } = segmentation

  const rectangleCornersIJK = points.map((world) => {
    return imageData.worldToIndex(world)
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
    imageData,
    dimensions,
    pointInRectangle,
    callback
  )

  triggerSegmentationDataModified(toolGroupUID, segmentationDataUID)
}

/**
 * Fill the inside of a rectangle
 * @param {string} toolGroupUID - The unique identifier of the tool group.
 * @param {OperationData} operationData - The data that will be used to create the
 * new rectangle.
 * @param {any} [constraintFn]
 */
export function fillInsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  constraintFn?: any
): void {
  fillRectangle(enabledElement, operationData, constraintFn, true)
}

/**
 * Fill the area outside of a rectangle for the toolGroupUID and segmentationDataUID.
 * @param {string} toolGroupUID - The unique identifier of the tool group.
 * @param {OperationData} operationData - The data that will be used to create the
 * new rectangle.
 * @param {any} [constraintFn]
 */
export function fillOutsideRectangle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  constraintFn?: any
): void {
  fillRectangle(enabledElement, operationData, constraintFn, false)
}
