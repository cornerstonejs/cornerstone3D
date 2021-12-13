import { Point3, Point2 } from '../../types'

/**
 * With a given vertices coordinates in IJK, it calculates the minimum and maximum
 * coordinate in each axis, and returns them. If dimensions are provided it also
 * clip the min, max to the provided width, height and depth
 *
 * @param vertices shape vertices coordinates
 * @param [dimensions] dimensions of the image
 * @returns [[xMin,xMax],[yMin,yMax], [zMin,zMax]]
 */
function getBoundingBoxAroundShape(
  vertices: Point3[],
  dimensions?: Point3
): [Point2, Point2, Point2] {
  let xMin = Infinity
  let xMax = 0
  let yMin = Infinity
  let yMax = 0
  let zMin = Infinity
  let zMax = 0

  vertices.forEach((v) => {
    xMin = Math.min(v[0], xMin)
    xMax = Math.max(v[0], xMax)
    yMin = Math.min(v[1], yMin)
    yMax = Math.max(v[1], yMax)
    zMin = Math.min(v[2], zMin)
    zMax = Math.max(v[2], zMax)
  })

  xMin = Math.floor(xMin)
  xMax = Math.floor(xMax)
  yMin = Math.floor(yMin)
  yMax = Math.floor(yMax)
  zMin = Math.floor(zMin)
  zMax = Math.floor(zMax)

  if (dimensions) {
    const [width, height, depth] = dimensions
    xMin = Math.max(0, xMin)
    xMax = Math.min(width, xMax)
    yMin = Math.max(0, yMin)
    yMax = Math.min(height, yMax)
    zMin = Math.max(0, zMin)
    zMax = Math.min(depth, zMax)
  }

  return [
    [xMin, xMax],
    [yMin, yMax],
    [zMin, zMax],
  ]
}

/**
 * Used the current bounds of the 2D rectangle and extends it in the view axis by numSlices
 * It compares min and max of each IJK to find the view axis (for axial, zMin === zMax) and
 * then calculates the extended range. It will assume the slice is relative to the
 * current slice and will add the given slices to the current max of the boundingBox.
 * @param boundsIJK  [[iMin, iMax], [jMin, jMax], [kMin, kMax]]
 * @param slices number of slices to project before and after
 * @returns extended bounds
 */
function extend2DBoundingBoxInViewAxis(
  boundsIJK: [Point2, Point2, Point2],
  numSlicesToProject: number
): [Point2, Point2, Point2] {
  // find which index in boundsIJK has the same first and last value
  const sliceNormalIndex = boundsIJK.findIndex(([min, max]) => min === max)

  if (sliceNormalIndex === -1) {
    throw new Error('3D bounding boxes not supported in an oblique plane')
  }

  // if (slices instanceof Array) {
  //   boundsIJK[sliceNormalIndex][0] = Math.min(...slices)
  //   boundsIJK[sliceNormalIndex][1] = Math.max(...slices)
  //   return boundsIJK
  // }

  // get the index and subtract slices from the min and add to the max
  boundsIJK[sliceNormalIndex][0] -= numSlicesToProject
  boundsIJK[sliceNormalIndex][1] += numSlicesToProject
  return boundsIJK
}

export { getBoundingBoxAroundShape, extend2DBoundingBoxInViewAxis }

/**
 * This method takes a bounding box in IJK, and uses the camera, to find the
 * direction of projection (slice normal), then replaces the min and max of the
 * slice number on the correct index of the bounding box.
 * @param boundsIJK [[iMin, iMax], [jMin, jMax], [kMin, kMax]] of bounding box
 * @param sliceNumbers Slice number min and max
 * @param vtkImageData The image data to get the direction from
 * @param viewPlaneNormal The camera view plane normal
 * @returns
 */
// function extendBoundingBox

// function extend2DBoundingBoxInViewAxis(
//   boundsIJK: [Point2, Point2, Point2],
//   sliceNumbers: number[],
//   vtkImageData: any,
//   viewPlaneNormal: Point3
// ): [Point2, Point2, Point2] {
//   const direction = vtkImageData.getDirection()

//   // Calculate size of spacing vector in normal direction
//   const iVector = direction.slice(0, 3)
//   const jVector = direction.slice(3, 6)
//   const kVector = direction.slice(6, 9)

//   const dotProducts = [
//     vec3.dot(iVector, <vec3>viewPlaneNormal),
//     vec3.dot(jVector, <vec3>viewPlaneNormal),
//     vec3.dot(kVector, <vec3>viewPlaneNormal),
//   ]

//   // absolute value of dot products
//   const absDotProducts = dotProducts.map((dotProduct) => Math.abs(dotProduct))

//   // the dot product will be one for the slice normal
//   const sliceNormalIndex = absDotProducts.indexOf(1)

//   boundsIJK[sliceNormalIndex][0] = sliceNumbers[0]
//   boundsIJK[sliceNormalIndex][1] = sliceNumbers[1]

//   return boundsIJK
// }
