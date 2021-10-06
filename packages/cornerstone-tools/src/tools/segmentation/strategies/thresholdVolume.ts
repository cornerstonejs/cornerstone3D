import { cache } from '@ohif/cornerstone-render'
import { fillInsideRectangle } from './fillRectangle'
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
  const [minThreshold, maxThreshold] = options
  const referenceVolume = cache.getVolume(volumeUID)
  const { vtkImageData } = referenceVolume

  const values = vtkImageData.getPointData().getScalars().getData()

  operationData.constraintFn = ([x, y, z]) => {
    const offset = vtkImageData.computeOffsetIndex([x, y, z])
    return minThreshold <= values[offset] && values[offset] <= maxThreshold
  }

  fillInsideRectangle(evt, operationData)
}

export default thresholdVolume
