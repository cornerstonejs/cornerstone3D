import { vec3 } from 'gl-matrix'
import { cache } from '@ohif/cornerstone-render'
import {
  getBoundingBoxAroundShape,
  fillInsideShape,
} from '../../../util/segmentation'

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
function thresholdVolumeByRange(evt: any, operationData: any): void {
  const { enabledElement } = evt
  const { renderingEngine } = enabledElement
  const { volumeUIDs, points, options } = operationData

  // Threshold Options
  const { lowerThreshold, higherThreshold, numSlices } = options

  if (volumeUIDs.length > 1) {
    throw new Error('thresholding more than one volumes is not supported yet')
  }

  const volumeUID = volumeUIDs[0]
  const referenceVolume = cache.getVolume(volumeUID)
  const { vtkImageData, dimensions } = referenceVolume

  const values = vtkImageData.getPointData().getScalars().getData()

  const rectangleCornersIJK = points.map((world) =>
    worldToIndex(vtkImageData, world)
  )

  const boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)
  const extendedBoundsIJK = _extendBoundingBoxInViewAxis(boundsIJK, numSlices)

  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = extendedBoundsIJK

  const topLeftFront = [iMin, jMin, kMin]
  const bottomRightBack = [iMax, jMax, kMax]

  const constraintFn = ([x, y, z]) => {
    const offset = vtkImageData.computeOffsetIndex([x, y, z])
    return lowerThreshold <= values[offset] && values[offset] <= higherThreshold
  }

  fillInsideShape(
    evt,
    operationData,
    () => true,
    constraintFn,
    topLeftFront,
    bottomRightBack
  )

  // todo: this renders all viewports, only renders viewports that have the modified labelmap actor
  // right now this is needed to update the labelmap on other viewports that have it (pt)
  renderingEngine.render()
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
function _extendBoundingBoxInViewAxis(boundsIJK, numSlices) {
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
