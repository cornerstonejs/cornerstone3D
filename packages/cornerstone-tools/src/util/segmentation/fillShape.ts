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
  topLeftFront,
  bottomRightBack,
  insideOrOutside = 'inside'
) {
  const { labelmap, segmentIndex, segmentsLocked } = operationData

  const { enabledElement } = evt
  const { renderingEngine } = enabledElement

  const { vtkImageData, dimensions } = labelmap

  // Values to modify
  const values = vtkImageData.getPointData().getScalars().getData()

  const [xMin, yMin, zMin] = topLeftFront
  const [xMax, yMax, zMax] = bottomRightBack

  // Todo: implement fill outside
  // if (insideOrOutside === 'outside') {
  //   fillOutsideBoundingBox(evt, operationData, topLeftFront, bottomRightBack)
  // }

  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      for (let z = zMin; z <= zMax; z++) {
        const offset = vtkImageData.computeOffsetIndex([x, y, z])

        if (segmentsLocked.includes(values[offset])) {
          continue
        }

        // If the pixel is the same segmentIndex and is inside the
        // Region defined by the array of points, set their value to segmentIndex.
        const pointIJK = [x, y, z]
        const pointLPS = vtkImageData.indexToWorld([x, y, z])
        if (pointInShape(pointIJK, pointLPS)) {
          values[offset] = segmentIndex
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

  // todo: this renders all viewports, only renders viewports that have the modified labelmap actor
  // right now this is needed to update the labelmap on other viewports that have it (pt)
  renderingEngine.render()
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
  topLeftFront,
  bottomRightBack
) {
  fillShape(
    evt,
    operationData,
    pointInShape,
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
  topLeftFront,
  bottomRightBack
) {
  fillShape(
    evt,
    operationData,
    (point) => !pointInShape(point),
    topLeftFront,
    bottomRightBack,
    'outside'
  )
}
