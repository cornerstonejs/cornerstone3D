import getTargetVolume from './getTargetVolume'
import vtkMath from 'vtk.js/Sources/Common/Core/Math'
import { Point3 } from './../../types'
import { VolumeViewport } from '@precisionmetrics/cornerstone-render'

/**
 * Returns a point on the line between the passed canvasPoint (clicked point often)
 * and the camera position that is off interest based on some criteria (maximum/minimum
 * intensity of the points in the line of sight). It iterated over the points on
 * the line with a defined steps size
 *
 * @param viewport Viewport
 * @param targetVolumeUID Volume UID
 * @param criteriaFunction A function that returns the point if it passes a certain
 * written logic, for instance, it can be a maxValue function that keeps the
 * records of all intensity values, and only return the point if its intensity
 * is greater than the maximum intensity of the points passed before.
 * @param canvasPointInWorld World coordinates of the point in the canvas.
 * @returns
 */
export default function getVoxelPositionBasedOnIntensity(
  viewport: VolumeViewport,
  targetVolumeUID: string,
  criteriaFunction: (intensity: number, point: Point3) => Point3,
  canvasPointInWorld: Point3
): Point3 {
  // 1. Getting the camera from the event details
  const camera = viewport.getCamera()
  const { position: cameraPosition } = camera

  // 2. Calculating the spacing in the normal direction, this will get
  // used as the step size for iterating over the points in the line of sight
  const { spacingInNormalDirection } = getTargetVolume(
    viewport,
    camera,
    targetVolumeUID
  )
  // 2.1 Making sure, we are not missing any point
  const stepSize = spacingInNormalDirection / 4

  // 3. Getting the bounds of the viewports. Search for brightest point is
  // limited to the visible bound
  const bounds = viewport.getBounds()
  const xMin = bounds[0]
  const xMax = bounds[1]

  // 5. Calculating the line, we use a parametric line definition
  const vector = [0, 0, 0]

  // 5.1 Point coordinate on the line
  let point = <Point3>[0, 0, 0]

  // 5.2 Calculating the line direction, and storing in vector
  vtkMath.subtract(canvasPointInWorld, cameraPosition, vector)

  let pickedPoint

  // 6. Iterating over the line from the lower bound to the upper bound, with the
  // specified step size
  for (let pointT = xMin; pointT <= xMax; pointT = pointT + stepSize) {
    // 6.1 Calculating the point x location
    point = [pointT, 0, 0]
    // 6.2 Calculating the point y,z location based on the line definition
    const t = (pointT - cameraPosition[0]) / vector[0]
    point[1] = t * vector[1] + cameraPosition[1]
    point[2] = t * vector[2] + cameraPosition[2]

    // 6.3 Checking if the points is inside the bounds
    if (_inBounds(point, bounds)) {
      // 6.4 Getting the intensity of the point
      const intensity = viewport.getIntensityFromWorld(point)
      // 6.5 Passing the intensity to the maximum value functions which decides
      // whether the current point is of interest based on some criteria
      const pointToPick = criteriaFunction(intensity, point)
      if (pointToPick) {
        pickedPoint = pointToPick
      }
    }
  }

  return pickedPoint
}

/**
 * Returns whether the point in the world is inside the bounds of the viewport
 * @param point coordinates in the world
 * @returns boolean
 */
const _inBounds = function (point: Point3, bounds: Array<number>): boolean {
  const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds
  return (
    point[0] > xMin &&
    point[0] < xMax &&
    point[1] > yMin &&
    point[1] < yMax &&
    point[2] > zMin &&
    point[2] < zMax
  )
}
