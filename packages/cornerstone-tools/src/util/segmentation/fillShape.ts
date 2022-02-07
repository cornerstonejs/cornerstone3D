import fillOutsideBoundingBox from './fillOutsideBoundingBox'

/**
 * Fill all pixels labeled with the activeSegmentIndex,
 * inside/outside the region defined by the shape.
 * @param  {Object} evt The Cornerstone event.
 * @param {Object}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {Object} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {number[]} topLeft The top left of the bounding box.
 * @param {number[]} bottomRight The bottom right of the bounding box.
 * @returns {null}
 */
function fillShape(
  evt,
  operationData,
  pointInShape,
  topLeft,
  bottomRight,
  insideOrOutside = 'inside'
) {
  const { pixelData, segmentIndex } = operationData

  if (pixelData === undefined || segmentIndex === undefined) {
    new Error(
      `fillInsideShape requires operationData to contain pixelData and segmentIndex`
    )

    return
  }

  const { width } = evt.detail.image
  const [xMin, yMin] = topLeft
  const [xMax, yMax] = bottomRight

  if (insideOrOutside === 'outside') {
    fillOutsideBoundingBox(evt, operationData, topLeft, bottomRight)
  }

  for (let x = xMin; x < xMax; x++) {
    for (let y = yMin; y < yMax; y++) {
      const pixelIndex = y * width + x

      // If the pixel is the same segmentIndex and is inside the
      // Region defined by the array of points, set their value to segmentIndex.
      if (
        pointInShape({
          x,
          y,
        })
      ) {
        pixelData[pixelIndex] = segmentIndex
      }
    }
  }
}

/**
 * Fill all pixels labeled with the activeSegmentIndex,
 * inside the region defined by the shape.
 * @param  {Object} evt The Cornerstone event.
 * @param {Object}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {Object} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {number[]} topLeft The top left of the bounding box.
 * @param {number[]} bottomRight The bottom right of the bounding box.
 * @returns {null}
 */
export function fillInsideShape(
  evt,
  operationData,
  pointInShape,
  topLeft,
  bottomRight
) {
  fillShape(evt, operationData, pointInShape, topLeft, bottomRight, 'inside')
}

/**
 * Fill all pixels labeled with the activeSegmentIndex,
 * outside the region defined by the shape.
 * @param  {Object} evt The Cornerstone event.
 * @param {Object}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @param {Object} pointInShape - A function that checks if a point, x,y is within a shape.
 * @param {number[]} topLeft The top left of the bounding box.
 * @param {number[]} bottomRight The bottom right of the bounding box.
 * @returns {null}
 */
export function fillOutsideShape(
  evt,
  operationData,
  pointInShape,
  topLeft,
  bottomRight
) {
  fillShape(
    evt,
    operationData,
    (point) => !pointInShape(point),
    topLeft,
    bottomRight,
    'outside'
  )
}
