import { vec3, vec2 } from 'gl-matrix'
// import fillOutsideBoundingBox from './fillOutsideBoundingBox'

/**
 * Fill all pixels labeled with the activeSegmentIndex,
 * inside/outside the region defined by the shape.
 * @param  {Object} evt The Cornerstone event.
 * @param {Object}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {Object} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {number[]} topLeftFront The top left of the bounding box.
 * @param {number[]} bottomRightBack The bottom right of the bounding box.
 * @returns {null}
 */
function fillShape(
  evt,
  operationData,
  pointInShape,
  constraintFn,
  topLeftFront,
  bottomRightBack,
  insideOrOutside = 'inside'
) {
  const { labelmap, segmentIndex, segmentsLocked } = operationData

  const { enabledElement } = evt
  const { viewport } = enabledElement

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
  const canvasPosStart = viewport.worldToCanvas(worldPosStart)

  const startPlusI = vec3.fromValues(iMin + 1, jMin, kMin)
  const startPlusJ = vec3.fromValues(iMin, jMin + 1, kMin)
  const startPlusK = vec3.fromValues(iMin, jMin, kMin + 1)

  // Estimate amount of 1 unit (index) change in I, J, K directions in canvas space
  const worldPosStartPlusI = vec3.create()
  const plusICanvasDelta = vec2.create()
  vtkImageData.indexToWorldVec3(startPlusI, worldPosStartPlusI)
  const canvasPosStartPlusI = viewport.worldToCanvas(worldPosStartPlusI)
  vec2.sub(plusICanvasDelta, canvasPosStartPlusI, canvasPosStart)

  const worldPosStartPlusJ = vec3.create()
  const plusJCanvasDelta = vec2.create()
  vtkImageData.indexToWorldVec3(startPlusJ, worldPosStartPlusJ)
  const canvasPosStartPlusJ = viewport.worldToCanvas(worldPosStartPlusJ)
  vec2.sub(plusJCanvasDelta, canvasPosStartPlusJ, canvasPosStart)

  const worldPosStartPlusK = vec3.create()
  const plusKCanvasDelta = vec2.create()
  vtkImageData.indexToWorldVec3(startPlusK, worldPosStartPlusK)
  const canvasPosStartPlusK = viewport.worldToCanvas(worldPosStartPlusK)
  vec2.sub(plusKCanvasDelta, canvasPosStartPlusK, canvasPosStart)

  // Todo: implement fill outside
  // if (insideOrOutside === 'outside') {
  //   fillOutsideBoundingBox(evt, operationData, topLeftFront, bottomRightBack)
  // }

  if (constraintFn) {
    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        for (let k = kMin; k <= kMax; k++) {
          const pointIJK = [i, j, k]

          // Todo: canvasCoords is not necessary to be known for rectangle-based tools
          const dI = i - iMin
          const dJ = j - jMin
          const dK = k - kMin
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
          const pointIJK = [i, j, k]
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
 * @param  {Object} evt The Cornerstone event.
 * @param {Object}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {Object} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {number[]} topLeftFront The top left of the bounding box.
 * @param {number[]} bottomRightBack The bottom right of the bounding box.
 * @returns {null}
 */
export function fillInsideShape(
  evt,
  operationData,
  pointInShape,
  constraintFn,
  topLeftFront,
  bottomRightBack
) {
  fillShape(
    evt,
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
 * @param  {Object} evt The Cornerstone event.
 * @param {Object}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {Object} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {number[]} topLeftFront The top left of the bounding box.
 * @param {number[]} bottomRightBack The bottom right of the bounding box.
 * @returns {null}
 */
export function fillOutsideShape(
  evt,
  operationData,
  pointInShape,
  constraintFn,
  topLeftFront,
  bottomRightBack
) {
  fillShape(
    evt,
    operationData,
    (point) => !pointInShape(point),
    constraintFn,
    topLeftFront,
    bottomRightBack,
    'outside'
  )
}
