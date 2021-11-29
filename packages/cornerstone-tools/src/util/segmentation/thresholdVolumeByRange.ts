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
  slices: {
    numSlices?: number // put numSlices before and after the current slice
    sliceNumbers?: number[] // absolute slice numbers
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

  let renderingEngine, viewport

  toolDataList.forEach((toolData) => {
    // Threshold Options
    const { enabledElement } = toolData.metadata
    const { points } = toolData.data.handles

    ;({ renderingEngine, viewport } = enabledElement)

    const { viewPlaneNormal } = viewport.getCamera()

    const referenceVolume = referenceVolumes[0]
    const { vtkImageData, dimensions } = referenceVolume

    // Todo: get directly from scalarData?
    const values = vtkImageData.getPointData().getScalars().getData()

    const rectangleCornersIJK = points.map(
      (world) => worldToIndex(vtkImageData, world) as Point3
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

export function getBoundIJKFromSliceNumbers(
  boundsIJK: [Point2, Point2, Point2],
  sliceNumbers: number[],
  vtkImageData: any,
  viewPlaneNormal: Point3
): [Point2, Point2, Point2] {
  const direction = vtkImageData.getDirection()

  // Calculate size of spacing vector in normal direction
  const iVector = direction.slice(0, 3)
  const jVector = direction.slice(3, 6)
  const kVector = direction.slice(6, 9)

  const dotProducts = [
    vec3.dot(iVector, <vec3>viewPlaneNormal),
    vec3.dot(jVector, <vec3>viewPlaneNormal),
    vec3.dot(kVector, <vec3>viewPlaneNormal),
  ]

  // absolute value of dot products
  const absDotProducts = dotProducts.map((dotProduct) => Math.abs(dotProduct))

  // the dot product will be one for the slice normal
  const sliceNormalIndex = absDotProducts.indexOf(1)

  boundsIJK[sliceNormalIndex][0] = sliceNumbers[0]
  boundsIJK[sliceNormalIndex][1] = sliceNumbers[1]

  return boundsIJK
}

/**
 * Used the current bounds of the 2D rectangle and extends it in the view axis by numSlices
 * It compares min and max of each IJK to find the view axis (for axial, zMin === zMax) and
 * then calculates the extended range.
 * @param boundsIJK  [[iMin, iMax], [jMin, jMax], [kMin, kMax]]
 * @param numSlices number of slices to extend
 * @returns extended bounds
 */
export function extendBoundingBoxInViewAxis(
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
