import { vec3 } from 'gl-matrix'
import {
  IImageVolume,
  IEnabledElement,
  Point3,
  Point2,
} from '@precisionmetrics/cornerstone-render/src/types'

import { cache } from '@precisionmetrics/cornerstone-render'

import {
  getBoundingBoxAroundShape,
  extend2DBoundingBoxInViewAxis,
} from '../segmentation'
import pointInShapeCallback from '../../util/planar/pointInShapeCallback'
import { triggerSegmentationDataModified } from '../../store/SegmentationModule/triggerSegmentationEvents'
import { ToolGroupSpecificSegmentationData } from '../../types/SegmentationStateTypes'
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState'

export type ThresholdRangeOptions = {
  higherThreshold: number
  lowerThreshold: number
  numSlicesToProject?: number // number of slices to project before and after current slice
  overwrite: boolean
}

export type ToolDataForThresholding = {
  metadata: {
    enabledElement: IEnabledElement
  }
  data: {
    handles: {
      points: Point3[]
    }
    cachedStats: {
      projectionPoints: Point3[][]
    }
  }
}

/**
 * Given an array of rectangle toolData, and a segmentation and referenceVolumes:
 * It fills the segmentation at SegmentIndex=1 based on a range of thresholds of the referenceVolumes
 * inside the drawn annotations.
 * @param {string} toolGroupUID - The toolGroupUID of the tool that is performing the operation
 * @param {RectangleRoiThresholdToolData[]} toolDataList Array of rectangle annotation toolData
 * @param {ToolGroupSpecificSegmentationData} segmentationData - The segmentation data to be modified
 * @param {IImageVolume} segmentation segmentation volume
 * @param {ThresholdRangeOptions} options Options for thresholding
 */
function thresholdVolumeByRange(
  toolGroupUID: string,
  toolDataList: ToolDataForThresholding[],
  referenceVolumes: IImageVolume[],
  segmentationData: ToolGroupSpecificSegmentationData,
  options: ThresholdRangeOptions
): IImageVolume {
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

  const { segmentationDataUID } = segmentationData

  const { scalarData, imageData: segmentationImageData } = segmentation
  const { lowerThreshold, higherThreshold, numSlicesToProject, overwrite } =
    options

  // set the segmentation to all zeros
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0
    }
  }

  toolDataList.forEach((toolData) => {
    // Threshold Options
    const { data } = toolData
    const { points } = data.handles

    const referenceVolume = referenceVolumes[0]
    const { imageData, dimensions } = referenceVolume

    // Todo: get directly from scalarData?
    const values = imageData.getPointData().getScalars().getData()

    let pointsToUse = points
    // If the tool is a 2D tool but has projection points, use them
    if (data.cachedStats?.projectionPoints) {
      const { projectionPoints } = data.cachedStats
      pointsToUse = [].concat(...projectionPoints) // cannot use flat() because of typescript compiler right now
    }

    const rectangleCornersIJK = pointsToUse.map(
      (world) => _worldToIndex(imageData, world) as Point3
    )
    let boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)

    // If the tool is 2D but it is configured to project to X amount of slices
    // Don't project the slices if projectionPoints have been used to define the extents
    if (numSlicesToProject && !data.cachedStats?.projectionPoints) {
      boundsIJK = extendBoundingBoxInSliceAxisIfNecessary(
        boundsIJK,
        numSlicesToProject
      )
    }

    const callback = ({ index, pointIJK }) => {
      const offset = imageData.computeOffsetIndex(pointIJK)
      const value = values[offset]
      if (value <= lowerThreshold || value >= higherThreshold) {
        return
      }

      scalarData[index] = 1
    }

    pointInShapeCallback(
      boundsIJK,
      scalarData,
      segmentationImageData,
      dimensions,
      () => true,
      callback
    )
  })

  triggerSegmentationDataModified(toolGroupUID, segmentationDataUID)

  return segmentation
}

export function extendBoundingBoxInSliceAxisIfNecessary(
  boundsIJK: [Point2, Point2, Point2],
  numSlicesToProject: number
): [Point2, Point2, Point2] {
  const extendedBoundsIJK = extend2DBoundingBoxInViewAxis(
    boundsIJK,
    numSlicesToProject
  )
  return extendedBoundsIJK
}

function _worldToIndex(imageData, ain) {
  const vout = vec3.fromValues(0, 0, 0)
  imageData.worldToIndex(ain, vout)
  return vout
}

export default thresholdVolumeByRange
