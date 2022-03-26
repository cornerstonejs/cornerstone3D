import { cache } from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'

import {
  getBoundingBoxAroundShape,
  extend2DBoundingBoxInViewAxis,
} from '../segmentation'
import { pointInShapeCallback } from '../../utilities'
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents'
import { ToolGroupSpecificRepresentation } from '../../types/SegmentationStateTypes'
import transformPhysicalToIndex from '../transformPhysicalToIndex'
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState'
import { LabelmapRepresentationData } from '../../types/LabelmapTypes'

export type ThresholdRangeOptions = {
  higherThreshold: number
  lowerThreshold: number
  numSlicesToProject?: number // number of slices to project before and after current slice
  overwrite: boolean
}

export type AnnotationForThresholding = {
  metadata: {
    enabledElement: Types.IEnabledElement
  }
  data: {
    handles: {
      points: Types.Point3[]
    }
    cachedStats: {
      projectionPoints: Types.Point3[][]
    }
  }
}

/**
 * Given an array of rectangle annotation, and a segmentation and referenceVolumes:
 * It fills the segmentation at SegmentIndex=1 based on a range of thresholds of the referenceVolumes
 * inside the drawn annotations.
 * @param annotations - Array of rectangle annotations
 * @param segmentationData - - The segmentation data to be modified
 * @param segmentation - segmentation volume
 * @param options - Options for thresholding
 */
function thresholdVolumeByRange(
  annotations: AnnotationForThresholding[],
  referenceVolumes: Types.IImageVolume[],
  segmentationRepresentation: ToolGroupSpecificRepresentation,
  options: ThresholdRangeOptions
): Types.IImageVolume {
  if (referenceVolumes.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  const segmentation = SegmentationState.getSegmentation(
    segmentationRepresentation.segmentationId
  )
  const { segmentationId } = segmentationRepresentation

  if (!segmentation) {
    throw new Error('No Segmentation Found')
  }

  const { type, representations } = segmentation
  const { volumeId } = representations[type] as LabelmapRepresentationData

  const segmentationVolume = cache.getVolume(volumeId)

  const { scalarData, imageData: segmentationImageData } = segmentationVolume
  const { lowerThreshold, higherThreshold, numSlicesToProject, overwrite } =
    options

  // set the segmentation to all zeros
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0
    }
  }

  annotations.forEach((annotation) => {
    // Threshold Options
    const { data } = annotation
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
      (world) => transformPhysicalToIndex(imageData, world) as Types.Point3
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

    pointInShapeCallback(segmentationImageData, () => true, callback, boundsIJK)
  })

  triggerSegmentationDataModified(segmentationId)

  return segmentationVolume
}

export function extendBoundingBoxInSliceAxisIfNecessary(
  boundsIJK: [Types.Point2, Types.Point2, Types.Point2],
  numSlicesToProject: number
): [Types.Point2, Types.Point2, Types.Point2] {
  const extendedBoundsIJK = extend2DBoundingBoxInViewAxis(
    boundsIJK,
    numSlicesToProject
  )
  return extendedBoundsIJK
}

export default thresholdVolumeByRange
