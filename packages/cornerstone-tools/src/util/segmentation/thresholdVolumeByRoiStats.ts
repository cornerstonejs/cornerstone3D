import { vec3 } from 'gl-matrix'
import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'

import { getBoundingBoxAroundShape } from '../segmentation'
import { RectangleRoiThresholdToolData } from '../../tools/segmentation/RectangleRoiThreshold'
import { Point3 } from '../../types'
import thresholdVolumeByRange from './thresholdVolumeByRange'
import {
  extendBoundingBoxInViewAxis,
  getBoundIJKFromSliceNumbers,
} from './thresholdVolumeByRange'

export type ThresholdRoiStatsOptions = {
  statistic: 'max' | 'min'
  weight: number
  slices: {
    numSlices?: number // put numSlices before and after the current slice
    sliceNumbers?: number[] // absolute slice numbers
  }
  overwrite: boolean
}

/**
 * Given an array of rectangle toolData, and a labelmap and referenceVolumes:
 * It loops over the drawn annotations ROIs (3D, 3rd dimension is determined by numSlices),
 * and calculates the `statistic` (given in options) for the merged Roi. Then,
 * it thresholds the referenceVolumes based on a weighted value of the statistic.
 * For instance in radiation oncology, usually 41% of the maximum of the ROI is used
 * in radiation planning.
 * @param {RectangleRoiThresholdToolData[]} toolDataList Array of rectangle annotaiton toolData
 * @param {IImageVolume[]} referenceVolumes array of volumes on whom thresholding is applied
 * @param {IImageVolume} labelmap segmentation volume
 * @param {ThresholdRoiStatsOptions} options Options for thresholding
 */
function thresholdVolumeByRoiStats(
  toolDataList: RectangleRoiThresholdToolData[],
  referenceVolumes: IImageVolume[],
  labelmap: IImageVolume,
  options: ThresholdRoiStatsOptions
): void {
  if (referenceVolumes.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  if (!labelmap) {
    throw new Error('labelmap is required')
  }

  const { slices, overwrite } = options

  const { scalarData } = labelmap
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0
    }
  }

  const referenceVolume = referenceVolumes[0]
  const { vtkImageData, dimensions } = referenceVolume

  const values = vtkImageData.getPointData().getScalars().getData()

  const { statistic } = options
  const [fn, baseValue] = _getStrategyFn(statistic)
  let value = baseValue

  toolDataList.forEach((toolData) => {
    const { points } = toolData.data.handles
    const { enabledElement } = toolData.metadata
    const { viewport } = enabledElement
    const { viewPlaneNormal } = viewport.getCamera()

    const rectangleCornersIJK = points.map(
      (world) => _worldToIndex(vtkImageData, world) as Point3
    )

    const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)

    let extendedBoundsIJK
    if (slices.numSlices) {
      extendedBoundsIJK = extendBoundingBoxInViewAxis(
        boundsIJK,
        slices.numSlices
      )
    } else if (slices.sliceNumbers) {
      extendedBoundsIJK = getBoundIJKFromSliceNumbers(
        boundsIJK,
        slices.sliceNumbers,
        vtkImageData,
        viewPlaneNormal
      )
    }

    const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = extendedBoundsIJK

    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        for (let k = kMin; k <= kMax; k++) {
          const offset = vtkImageData.computeOffsetIndex([i, j, k])
          value = fn(values[offset], value)
        }
      }
    }
  })

  const rangeOptions = {
    lowerThreshold: options.weight * value,
    higherThreshold: +Infinity,
    slices: {
      numSlices: slices.numSlices,
      sliceNumbers: slices.sliceNumbers,
    },
    overwrite,
  }

  // Run threshold volume by the new range
  thresholdVolumeByRange(toolDataList, referenceVolumes, labelmap, rangeOptions)
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
