import { vec3 } from 'gl-matrix'
import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'

import {
  getBoundingBoxAroundShape,
  extend2DBoundingBoxInViewAxis,
} from '../segmentation'
import { RectangleRoiThresholdToolData } from '../../tools/segmentation/RectangleRoiThreshold'
import { Point3 } from '../../types'
import pointInShapeCallback from '../../util/planar/pointInShapeCallback'
import triggerLabelmapRender from './triggerLabelmapRender'

export type ThresholdRangeOptions = {
  higherThreshold: number
  lowerThreshold: number
  slices: {
    numSlices?: number // put numSlices before and after the current slice
    sliceNumbers?: number[] // absolute first and last slice
  }
  overwrite: boolean
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
  toolDataList: RectangleRoiThresholdToolData[],
  referenceVolumes: IImageVolume[],
  labelmap: IImageVolume,
  options: ThresholdRangeOptions
): void {
  if (referenceVolumes.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  if (!labelmap) {
    throw new Error('labelmap is required')
  }

  const { scalarData, vtkImageData: labelmapImageData } = labelmap
  const { lowerThreshold, higherThreshold, slices, overwrite } = options

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
    const { points } = toolData.data.handles

    ;({ renderingEngine } = enabledElement)

    const referenceVolume = referenceVolumes[0]
    const { vtkImageData, dimensions } = referenceVolume

    // Todo: get directly from scalarData?
    const values = vtkImageData.getPointData().getScalars().getData()

    const rectangleCornersIJK = points.map(
      (world) => worldToIndex(vtkImageData, world) as Point3
    )

    const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)

    const slicesToUse = slices.numSlices
      ? slices.numSlices
      : slices.sliceNumbers

    const extendedBoundsIJK = extend2DBoundingBoxInViewAxis(
      boundsIJK,
      slicesToUse
    )

    const callback = ({ index, pointIJK }) => {
      const offset = vtkImageData.computeOffsetIndex(pointIJK)
      const value = values[offset]
      if (value <= lowerThreshold || value >= higherThreshold) {
        return
      }

      scalarData[index] = 1
    }

    pointInShapeCallback(
      extendedBoundsIJK,
      scalarData,
      labelmapImageData,
      dimensions,
      () => true,
      callback
    )
  })

  triggerLabelmapRender(renderingEngine, labelmap, labelmapImageData)
}

function worldToIndex(imageData, ain) {
  const vout = vec3.fromValues(0, 0, 0)
  imageData.worldToIndex(ain, vout)
  return vout
}

export default thresholdVolumeByRange
