import { vec3 } from 'gl-matrix'
import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'

import { getBoundingBoxAroundShape } from '../segmentation'
import { RectangleRoiThresholdToolData } from '../../tools/segmentation/RectangleRoiThreshold'
import { Point3, Point2 } from '../../types'
import pointInShapeCallback from '../../util/planar/pointInShapeCallback'
import triggerLabelmapRender from './triggerLabelmapRender'

export type ThresholdRangeOptions = {
  higherThreshold: number
  lowerThreshold: number
  numSlices: number
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

  const { dimensions, scalarData, vtkImageData: labelmapImageData } = labelmap

  const { lowerThreshold, higherThreshold, numSlices } = options
  let renderingEngine

  toolDataList.forEach((toolData) => {
    // Threshold Options
    const { enabledElement } = toolData.metadata
    const { points } = toolData.data.handles

    const { viewport } = enabledElement
    ;({ renderingEngine } = enabledElement)

    // Todo: Resetting the labelmap imageData value so that the same tool can
    // execute threshold execution more than once, but this is super slow
    // const values = labelmap.vtkImageData.getPointData().getScalars().getData()
    // const length = values.length
    // for (let i = 0; i <= length; i++) {
    //   values[i] = 0
    // }

    const referenceVolume = referenceVolumes[0]
    const { vtkImageData, dimensions } = referenceVolume

    const values = vtkImageData.getPointData().getScalars().getData()

    const rectangleCornersIJK = points.map(
      (world) => worldToIndex(vtkImageData, world) as Point3
    )

    const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)
    const extendedBoundsIJK = _extendBoundingBoxInViewAxis(boundsIJK, numSlices)

    const callback = (canvasCoords, pointIJK, index, newValue) => {
      const offset = vtkImageData.computeOffsetIndex(pointIJK)
      const value = values[offset]
      if (value <= lowerThreshold || value >= higherThreshold) {
        return
      }

      scalarData[index] = 1
    }

    pointInShapeCallback(
      extendedBoundsIJK,
      viewport.worldToCanvas,
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

/**
 * Used the current bounds of the 2D rectangle and extends it in the view axis by numSlices
 * It compares min and max of each IJK to find the view axis (for axial, zMin === zMax) and
 * then calculates the extended range.
 * @param boundsIJK  [[iMin, iMax], [jMin, jMax], [kMin, kMax]]
 * @param numSlices number of slices to extend
 * @returns extended bounds
 */
function _extendBoundingBoxInViewAxis(
  boundsIJK: [Point2, Point2, Point2],
  numSlices: number
): [Point2, Point2, Point2] {
  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = boundsIJK
  if (iMin === iMax) {
    return [
      [iMin - numSlices, iMax + numSlices],
      [jMin, jMax],
      [kMin, kMax],
    ]
  } else if (jMin === jMax) {
    return [
      [iMin, iMax],
      [jMin - numSlices, jMax + numSlices],
      [kMin, kMax],
    ]
  } else if (kMin === kMax) {
    return [
      [iMin, iMax],
      [jMin, jMax],
      [kMin - numSlices, kMax + numSlices],
    ]
  } else {
    throw new Error('3D bounding boxes not supported in an oblique plane')
  }
}

export default thresholdVolumeByRange
