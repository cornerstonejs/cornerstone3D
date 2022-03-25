import type { Types } from '@cornerstonejs/core'

import transformPhysicalToIndex from '../../utilities/transformPhysicalToIndex'
import { getBoundingBoxAroundShape } from '../segmentation'
import { ToolGroupSpecificSegmentationData } from '../../types'
import thresholdVolumeByRange, {
  AnnotationForThresholding,
  extendBoundingBoxInSliceAxisIfNecessary,
} from './thresholdVolumeByRange'
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState'
import { cache } from '@cornerstonejs/core'

export type ThresholdRoiStatsOptions = {
  statistic: 'max' | 'min'
  weight: number
  numSlicesToProject?: number
  overwrite: boolean
}

/**
 * Given an array of rectangle annotation, and a labelmap and referenceVolumes:
 * It loops over the drawn annotations ROIs (3D, 3rd dimension is determined by numSlices),
 * and calculates the `statistic` (given in options) for the merged Roi. Then,
 * it thresholds the referenceVolumes based on a weighted value of the statistic.
 * For instance in radiation oncology, usually 41% of the maximum of the ROI is used
 * in radiation planning.
 * @param toolGroupId - The toolGroupId of the tool that is performing the operation
 * @param annotations Array of rectangle annotation annotation
 * @param segmentationData - The segmentation data to be modified
 * @param labelmap segmentation volume
 * @param options Options for thresholding
 */
function thresholdVolumeByRoiStats(
  toolGroupId: string,
  annotations: AnnotationForThresholding[],
  referenceVolumes: Types.IImageVolume[],
  segmentationData: ToolGroupSpecificSegmentationData,
  options: ThresholdRoiStatsOptions
): void {
  if (referenceVolumes.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  const globalState = SegmentationState.getSegmentation(
    segmentationData.volumeId
  )

  if (!globalState) {
    throw new Error('No Segmentation Found')
  }

  const { volumeId } = globalState
  const segmentation = cache.getVolume(volumeId)

  const { numSlicesToProject, overwrite } = options

  const { scalarData } = segmentation
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0
    }
  }

  const referenceVolume = referenceVolumes[0]
  const { imageData, dimensions } = referenceVolume

  const values = imageData.getPointData().getScalars().getData()

  const { statistic } = options
  const [fn, baseValue] = _getStrategyFn(statistic)
  let value = baseValue

  annotations.forEach((annotation) => {
    const { data } = annotation
    const { points } = data.handles

    let pointsToUse = points
    // If the tool is a 2D tool but has projection points, use them
    if (data.cachedStats?.projectionPoints) {
      const { projectionPoints } = data.cachedStats
      pointsToUse = [].concat(...projectionPoints) // cannot use flat() because of typescript compiler right now
    }

    const rectangleCornersIJK = pointsToUse.map(
      (world) => transformPhysicalToIndex(imageData, world) as Types.Point3
    )
    let boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)

    // Don't project the slices if projectionPoints have been used to define the extents
    if (numSlicesToProject && !data.cachedStats?.projectionPoints) {
      boundsIJK = extendBoundingBoxInSliceAxisIfNecessary(
        boundsIJK,
        numSlicesToProject
      )
    }

    const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = boundsIJK

    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        for (let k = kMin; k <= kMax; k++) {
          const offset = imageData.computeOffsetIndex([i, j, k])
          value = fn(values[offset], value)
        }
      }
    }
  })

  const rangeOptions = {
    lowerThreshold: options.weight * value,
    higherThreshold: +Infinity,
    numSlicesToProject,
    overwrite,
  }

  // Run threshold volume by the new range
  thresholdVolumeByRange(
    toolGroupId,
    annotations,
    referenceVolumes,
    segmentationData,
    rangeOptions
  )
}

function _getStrategyFn(statistic) {
  let fn, baseValue
  if (statistic === 'min') {
    baseValue = Infinity
    fn = (number, minValue) => {
      if (number < minValue) {
        minValue = number
      }
      return minValue
    }
  } else if (statistic === 'max') {
    baseValue = -Infinity
    fn = (number, maxValue) => {
      if (number > maxValue) {
        maxValue = number
      }
      return maxValue
    }
  } else {
    throw new Error('Statistics other than min or max are not supported yet')
  }
  return [fn, baseValue]
}

export default thresholdVolumeByRoiStats
