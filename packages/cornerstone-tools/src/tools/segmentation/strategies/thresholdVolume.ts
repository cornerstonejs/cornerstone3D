import { vec3 } from 'gl-matrix'
import { cache } from '@ohif/cornerstone-render'
import {
  getBoundingBoxAroundShape,
  fillInsideShape,
} from '../../../util/segmentation'

function worldToIndex(imageData, ain) {
  const vout = vec3.fromValues(0, 0, 0)
  imageData.worldToIndex(ain, vout)
  return vout
}

/**
 *
 * Todo: make it work for more than one volume
 * 1. Gets referenceVolumes from the cache
 * 1. Gets labelmapVolume from the cache
 * 2. Calculates the bounding box corners
 * 3. Go over pixel data in each referenceVolumes and compare to the
 * threshold, if lies between, add segment to the labelmap
 * 4. Render the viewports containing the referenceVolume
 * @param evt
 * @param volumeUIDs
 * @param labelmapUID
 * @param boundingBoxInfo
 * @param thresholdInfo
 */
function thresholdVolume(evt: any, operationData: any): void {
  const { volumeUIDs, options } = operationData

  if (volumeUIDs.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  const volumeUID = volumeUIDs[0]
  const { lowerThreshold, higherThreshold, numSlices } = options
  const referenceVolume = cache.getVolume(volumeUID)
  const { vtkImageData } = referenceVolume

  const values = vtkImageData.getPointData().getScalars().getData()

  operationData.constraintFn = ([x, y, z]) => {
    const offset = vtkImageData.computeOffsetIndex([x, y, z])
    return lowerThreshold <= values[offset] && values[offset] <= higherThreshold
  }

  const { points, constraintFn } = operationData

  const rectangleCornersIJK = points.map((world) =>
    worldToIndex(vtkImageData, world)
  )

  const [[xMin, xMax], [yMin, yMax], [zMin, zMax]] = getBoundingBoxAroundShape(
    rectangleCornersIJK,
    vtkImageData
  )

  const zMinToUse = zMin - numSlices
  const zMaxToUse = zMax + numSlices

  const topLeftFront = [xMin, yMin, zMinToUse]
  const bottomRightBack = [xMax, yMax, zMaxToUse]

  fillInsideShape(
    evt,
    operationData,
    () => true,
    constraintFn ? constraintFn : undefined,
    topLeftFront,
    bottomRightBack
  )
}

export default thresholdVolume
