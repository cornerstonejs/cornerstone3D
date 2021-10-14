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
export default function getBoundingBoxAroundShape(
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
