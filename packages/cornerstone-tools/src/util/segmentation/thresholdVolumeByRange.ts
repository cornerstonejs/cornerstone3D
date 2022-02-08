import { vec3 } from 'gl-matrix'
import {
  IImageVolume,
  IEnabledElement,
  Point3,
  Point2,
} from '@precisionmetrics/cornerstone-render/src/types'

import {
  getBoundingBoxAroundShape,
  extend2DBoundingBoxInViewAxis,
} from '../segmentation'
import pointInShapeCallback from '../../util/planar/pointInShapeCallback'
import triggerLabelmapRender from './triggerLabelmapRender'

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
 * Given an array of rectangle toolData, and a labelmap and referenceVolumes:
 * It fills the labelmap at SegmentIndex=1 based on a range of thresholds of the referenceVolumes
 * inside the drawn annotations.
 * @param {RectangleRoiThresholdToolData[]} toolDataList Array of rectangle annotaiton toolData
 * @param {IImageVolume[]} referenceVolumes array of volumes on whom thresholding is applied
 * @param {IImageVolume} labelmap segmentation volume
 * @param {ThresholdRangeOptions} options Options for thresholding
 */
function thresholdVolumeByRange(
  toolDataList: ToolDataForThresholding[],
  referenceVolumes: IImageVolume[],
  labelmap: IImageVolume,
  options: ThresholdRangeOptions
): IImageVolume {
  if (referenceVolumes.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  if (!labelmap) {
    throw new Error('labelmap is required')
  }

  const { scalarData, imageData: labelmapImageData } = labelmap
  const { lowerThreshold, higherThreshold, numSlicesToProject, overwrite } =
    options

  // set the labelmap to all zeros
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0
    }
  }

  let renderingEngine

  toolDataList.forEach((toolData) => {
    // Threshold Options
    const { enabledElement } = toolData.metadata
    const { data } = toolData
    const { points } = data.handles

    ;({ renderingEngine } = enabledElement)

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

    // If the tool is 2D but it is configed to project to X amount of slices
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
      labelmapImageData,
      dimensions,
      () => true,
      callback
    )
  })

  triggerLabelmapRender(renderingEngine, labelmap, labelmapImageData)
  return labelmap
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
