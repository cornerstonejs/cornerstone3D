import { Types } from '@precisionmetrics/cornerstone-render'
import {
  Point3,
  IImageVolume,
  IEnabledElement,
} from '@precisionmetrics/cornerstone-render/src/types'

import { vec3 } from 'gl-matrix'
import pointInSurroundingSphereCallback from '../../../util/planar/pointInSurroundingSphereCallback'

type OperationData = {
  points: [Point3, Point3, Point3, Point3]
  volume: IImageVolume
  viewPlaneNormal: Point3
  viewUp: Point3
}

type Evt = {
  enabledElement: IEnabledElement
}

/**
 * It performs the suv Peak calculation on a PET volume. It uses the drawn circle
 * as the "great circle" of the surrounding sphere (WikiPedia: A circle on a sphere
 * whose plane passes through the center of the sphere is called a great circle).
 * It finds the maximum voxel in the sphere, and puts another 1cc (1.2 cm in diameter) sphere
 * centered on the maximum intensity, and reports the Mean and Max of points
 * within the second sphere.
 *
 * @param {Evt} evt enabledElement event
 * @param {OperationData} operationData object containing the volume, annotation
 * points (world), camera viewUp and viewPlaneNormal
 * @returns
 */
export default function suvPeakStrategy(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): any {
  const { viewport } = enabledElement
  const { volume: ptVolume, points: circlePoints, viewUp } = operationData

  const { imageData } = ptVolume

  /**
   * 1. Find the maximum intensity point in IJK in the surrounding sphere
   * that includes the current drawn circle as its middle base.
   */
  let maxIntensity = -Infinity
  let maxIntensityIJK = [0, 0, 0]

  const callback = ({ pointIJK, value }) => {
    if (value > maxIntensity) {
      maxIntensity = value
      maxIntensityIJK = pointIJK
    }
  }

  pointInSurroundingSphereCallback(
    viewport,
    ptVolume,
    [circlePoints[0], circlePoints[1]],
    callback
  )

  /**
   * 2. Find the bottom and top of the great circle for the second sphere (1cc sphere)
   * diameter of 12mm = 1.2cm ~ = 1cc sphere
   */
  const diameter = 12
  const secondaryCircleWorld = vec3.create()
  const bottomWorld = vec3.create()
  const topWorld = vec3.create()
  imageData.indexToWorld(<vec3>maxIntensityIJK, secondaryCircleWorld)
  vec3.scaleAndAdd(bottomWorld, secondaryCircleWorld, viewUp, -diameter / 2)
  vec3.scaleAndAdd(topWorld, secondaryCircleWorld, viewUp, diameter / 2)
  const suvPeakCirclePoints = [bottomWorld, topWorld] as [Point3, Point3]

  /**
   * 3. Find the Mean and Max of the 1cc sphere centered on the suv Max of the previous
   * sphere
   */
  let count = 0
  let acc = 0
  let max = -Infinity
  const suvPeakMeanCallback = ({ value }) => {
    if (value > max) {
      max = value
    }
    acc += value
    count += 1
  }

  pointInSurroundingSphereCallback(
    viewport,
    ptVolume,
    suvPeakCirclePoints,
    suvPeakMeanCallback
  )

  const mean = acc / count

  return [bottomWorld, topWorld, mean, max]
}
