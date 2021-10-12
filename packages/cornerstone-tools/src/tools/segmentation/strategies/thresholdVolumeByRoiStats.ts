import { vec3 } from 'gl-matrix'
import { cache } from '@ohif/cornerstone-render'
import { getBoundingBoxAroundShape } from '../../../util/segmentation'
import thresholdVolumeByRange from './thresholdVolumeByRange'

// This
type ThresholdByRoiStatsOptions = {
  statistic: 'max' | 'min'
  weight: number
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

/**
 * This strategy applied a weighted value of the computed statistic of the whole ROI
 * and use that as the minimum value for the thresholding the volume
 * @param evt
 * @param operationData
 * @param strategyOptions
 */
function thresholdVolumeByRoiStats(
  evt: any,
  operationData: any,
  strategyOptions: ThresholdByRoiStatsOptions = {
    statistic: 'max',
    weight: 0.41,
  }
): void {
  const { volumeUIDs, points, options } = operationData
  const { numSlices } = options

  if (volumeUIDs.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  const volumeUID = volumeUIDs[0]
  const referenceVolume = cache.getVolume(volumeUID)
  const { vtkImageData, dimensions } = referenceVolume

  const values = vtkImageData.getPointData().getScalars().getData()

  const rectangleCornersIJK = points.map((world) =>
    _worldToIndex(vtkImageData, world)
  )

  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = getBoundingBoxAroundShape(
    rectangleCornersIJK,
    dimensions
  )

  const kMinToUse = kMin - numSlices
  const kMaxToUse = kMax + numSlices

  // Strategy Options
  const { statistic, weight } = strategyOptions
  const [fn, baseValue] = _getStrategyFn(statistic)

  let value = baseValue
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      for (let k = kMinToUse; k <= kMaxToUse; k++) {
        const offset = vtkImageData.computeOffsetIndex([i, j, k])
        value = fn(values[offset], value)
      }
    }
  }

  // Run threshold volume by the new range
  options.lowerThreshold = weight * value
  options.higherThreshold = +Infinity
  thresholdVolumeByRange(evt, operationData)
}

export default thresholdVolumeByRoiStats
