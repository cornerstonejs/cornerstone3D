import { vec3 } from 'gl-matrix'
import type { Types } from '@precisionmetrics/cornerstone-render'

import { getBoundingBoxAroundShape } from '../segmentation'
import { ToolGroupSpecificSegmentationData } from '../../types'
import thresholdVolumeByRange, {
  ToolDataForThresholding,
  extendBoundingBoxInSliceAxisIfNecessary,
} from './thresholdVolumeByRange'
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState'
import { cache } from '@precisionmetrics/cornerstone-render'

export type ThresholdRoiStatsOptions = {
  statistic: 'max' | 'min'
  weight: number
  numSlicesToProject?: number
  overwrite: boolean
}

/**
 * Given an array of rectangle toolData, and a labelmap and referenceVolumes:
 * It loops over the drawn annotations ROIs (3D, 3rd dimension is determined by numSlices),
 * and calculates the `statistic` (given in options) for the merged Roi. Then,
 * it thresholds the referenceVolumes based on a weighted value of the statistic.
 * For instance in radiation oncology, usually 41% of the maximum of the ROI is used
 * in radiation planning.
 * @param toolGroupUID - The toolGroupUID of the tool that is performing the operation
 * @param toolDataList Array of rectangle annotation toolData
 * @param segmentationData - The segmentation data to be modified
 * @param labelmap segmentation volume
 * @param options Options for thresholding
 */
function thresholdVolumeByRoiStats(
  toolGroupUID: string,
  toolDataList: ToolDataForThresholding[],
  referenceVolumes: Types.IImageVolume[],
  segmentationData: ToolGroupSpecificSegmentationData,
  options: ThresholdRoiStatsOptions
): void {
  if (referenceVolumes.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  const globalState = SegmentationState.getGlobalSegmentationDataByUID(
    segmentationData.volumeUID
  )

  if (!globalState) {
    throw new Error('No Segmentation Found')
  }

  const { volumeUID } = globalState
  const segmentation = cache.getVolume(volumeUID)

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

  toolDataList.forEach((toolData) => {
    const { data } = toolData
    const { points } = data.handles

    let pointsToUse = points
    // If the tool is a 2D tool but has projection points, use them
    if (data.cachedStats?.projectionPoints) {
      const { projectionPoints } = data.cachedStats
      pointsToUse = [].concat(...projectionPoints) // cannot use flat() because of typescript compiler right now
    }

    const rectangleCornersIJK = pointsToUse.map(
      (world) => _worldToIndex(imageData, world) as Types.Point3
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
    toolGroupUID,
    toolDataList,
    referenceVolumes,
    segmentationData,
    rangeOptions
  )
}

function _worldToIndex(imageData, ain) {
  const vout = vec3.fromValues(0, 0, 0)
  imageData.worldToIndex(ain, vout)
  return vout
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
