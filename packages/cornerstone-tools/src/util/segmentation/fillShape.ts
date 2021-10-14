import {
  IEnabledElement,
  IImageVolume,
} from '@ohif/cornerstone-render/src/types'
import { vec3, vec2 } from 'gl-matrix'

import { Point3, Point2 } from '../../types'

type FillShapeOperationData = {
  volume: IImageVolume
  segmentIndex: number
  segmentsLocked: number[]
}

type PointInShapeFn = (pointIJK: Point3, canvasCoords?: Point2) => boolean
type ConstraintFn = (pointIJK: Point3) => boolean

/**
 * Fill all pixels labeled with the activeSegmentIndex,
 * inside/outside the region defined by the shape.
 * @param  {IEnabledElement} element Cornerstone enabled element.
 * @param {FillShapeOperationData}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {PointInShapeFn} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {ConstraintFn} constraintFn - A function that applies a constraint for each pointIJK,
 * this can be used to apply intensity threshold
 * @param {Point3} topLeftFront The top left of the bounding box.
 * @param {Point3} bottomRightBack The bottom right of the bounding box.
 * @returns void
 */
function fillShape(
  enabledElement: IEnabledElement,
  operationData: FillShapeOperationData,
  pointInShape: PointInShapeFn,
  constraintFn: ConstraintFn,
  topLeftFront: Point3,
  bottomRightBack: Point3,
  insideOrOutside = 'inside'
) {
  const { viewport } = enabledElement
  const { volume: labelmap, segmentIndex, segmentsLocked } = operationData

  const { vtkImageData, dimensions } = labelmap

  // Values to modify
  const values = vtkImageData.getPointData().getScalars().getData()

  const [iMin, jMin, kMin] = topLeftFront
  const [iMax, jMax, kMax] = bottomRightBack

  // Note: the following conversions from ijk to canvas are implemented to avoid any
  // conversion from index to world in the for loop. The same implementation is done
  // in the ellipticalRoiTool. I 'believe' canvas space would be the proper space
  // for oblique brush tools and not the indexIJK space. So I'm keeping this here
  // for now, although for orthogonal planes, indexIJK space is sufficient for checking
  // if the points are inside a tool shape (circle, or ellipse).
  const start = vec3.fromValues(iMin, jMin, kMin)

  const worldPosStart = vec3.create()
  vtkImageData.indexToWorldVec3(start, worldPosStart)
  const canvasPosStart = <vec2>viewport.worldToCanvas(<Point3>worldPosStart)

  const startPlusI = vec3.fromValues(iMin + 1, jMin, kMin)
  const startPlusJ = vec3.fromValues(iMin, jMin + 1, kMin)
  const startPlusK = vec3.fromValues(iMin, jMin, kMin + 1)

  // Estimate amount of 1 unit (index) change in I, J, K directions in canvas space
  const worldPosStartPlusI = vec3.create()
  const plusICanvasDelta = vec2.create()
  vtkImageData.indexToWorldVec3(startPlusI, worldPosStartPlusI)
  const canvasPosStartPlusI = <vec2>(
    viewport.worldToCanvas(<Point3>worldPosStartPlusI)
  )
  vec2.sub(plusICanvasDelta, canvasPosStartPlusI, canvasPosStart)

  const worldPosStartPlusJ = vec3.create()
  const plusJCanvasDelta = vec2.create()
  vtkImageData.indexToWorldVec3(startPlusJ, worldPosStartPlusJ)
  const canvasPosStartPlusJ = <vec2>(
    viewport.worldToCanvas(<Point3>worldPosStartPlusJ)
  )
  vec2.sub(plusJCanvasDelta, canvasPosStartPlusJ, canvasPosStart)

  const worldPosStartPlusK = vec3.create()
  const plusKCanvasDelta = vec2.create()
  vtkImageData.indexToWorldVec3(startPlusK, worldPosStartPlusK)
  const canvasPosStartPlusK = <vec2>(
    viewport.worldToCanvas(<Point3>worldPosStartPlusK)
  )
  vec2.sub(plusKCanvasDelta, canvasPosStartPlusK, canvasPosStart)

  // Todo: implement fill outside
  // if (insideOrOutside === 'outside') {
  //   fillOutsideBoundingBox(evt, operationData, topLeftFront, bottomRightBack)
  // }

  if (constraintFn) {
    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        for (let k = kMin; k <= kMax; k++) {
          const pointIJK = <Point3>[i, j, k]

          // Todo: canvasCoords is not necessary to be known for rectangle-based tools
          const dI = i - iMin
          const dJ = j - jMin
          const dK = k - kMin
          let canvasCoords = <Point2>[canvasPosStart[0], canvasPosStart[1]]

          canvasCoords = [
            canvasCoords[0] +
              plusICanvasDelta[0] * dI +
              plusJCanvasDelta[0] * dJ +
              plusKCanvasDelta[0] * dK,
            canvasCoords[1] +
              plusICanvasDelta[1] * dI +
              plusJCanvasDelta[1] * dJ +
              plusKCanvasDelta[1] * dK,
          ]

          const offset = vtkImageData.computeOffsetIndex(pointIJK)

          if (segmentsLocked.includes(values[offset])) {
            continue
          }

          if (pointInShape(pointIJK, canvasCoords) && constraintFn(pointIJK)) {
            values[offset] = segmentIndex
          }
        }
      }
    }
  } else {
    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        for (let k = kMin; k <= kMax; k++) {
          const pointIJK = <Point3>[i, j, k]
          const dI = i - iMin
          const dJ = j - jMin
          const dK = k - kMin
          // Todo: canvasCoords is not necessary to be known for rectangle-based tools
          let canvasCoords = [canvasPosStart[0], canvasPosStart[1]]

          canvasCoords = [
            canvasCoords[0] +
              plusICanvasDelta[0] * dI +
              plusJCanvasDelta[0] * dJ +
              plusKCanvasDelta[0] * dK,
            canvasCoords[1] +
              plusICanvasDelta[1] * dI +
              plusJCanvasDelta[1] * dJ +
              plusKCanvasDelta[1] * dK,
          ]

          const offset = vtkImageData.computeOffsetIndex(pointIJK)

          if (segmentsLocked.includes(values[offset])) {
            continue
          }

          if (pointInShape(pointIJK, canvasCoords)) {
            values[offset] = segmentIndex
          }
        }
      }
    }
  }

  // Todo: optimize this to only update frames that have changed
  for (let i = 0; i < dimensions[2]; i++) {
    labelmap.vtkOpenGLTexture.setUpdatedFrame(i)
  }

  vtkImageData.getPointData().getScalars().setData(values)
  vtkImageData.modified()
}

/**
 * Fill all pixels labeled with the activeSegmentIndex,
 * inside the region defined by the shape.
 * @param  {IEnabledElement} element Cornerstone enabled element.
 * @param {FillShapeOperationData}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {PointInShapeFn} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {ConstraintFn} constraintFn - A function that applies a constraint for each pointIJK,
 * this can be used to apply intensity threshold
 * @param {Point3} topLeftFront The top left of the bounding box.
 * @param {Point3} bottomRightBack The bottom right of the bounding box.
 * @returns void
 */
export function fillInsideShape(
  enabledElement: IEnabledElement,
  operationData: FillShapeOperationData,
  pointInShape: PointInShapeFn,
  constraintFn: ConstraintFn,
  topLeftFront: Point3,
  bottomRightBack: Point3
):void {
  fillShape(
    enabledElement,
    operationData,
    pointInShape,
    constraintFn,
    topLeftFront,
    bottomRightBack,
    'inside'
  )
}

/**
 * Fill all pixels labeled with the activeSegmentIndex,
 * outside the region defined by the shape.
 * @param  {IEnabledElement} element Cornerstone enabled element.
 * @param {FillShapeOperationData}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {PointInShapeFn} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {ConstraintFn} constraintFn - A function that applies a constraint for each pointIJK,
 * this can be used to apply intensity threshold
 * @param {Point3} topLeftFront The top left of the bounding box.
 * @param {Point3} bottomRightBack The bottom right of the bounding box.
 * @returns void
 */
export function fillOutsideShape(
  enabledElement: IEnabledElement,
  operationData: FillShapeOperationData,
  pointInShape: PointInShapeFn,
  constraintFn: ConstraintFn,
  topLeftFront: Point3,
  bottomRightBack: Point3
):void {
  fillShape(
    enabledElement,
    operationData,
    (point) => !pointInShape(point),
    constraintFn,
    topLeftFront,
    bottomRightBack,
    'outside'
  )
}
