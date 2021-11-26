import { vec3 } from 'gl-matrix'
import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'

import { Point3 } from '../../types'
import pointInShapeCallback from '../../util/planar/pointInShapeCallback'
import pointInSurroundingSphereCallback from '../../util/planar/pointInSurroundingSphereCallback'

/** */
function calculateSuvPeak(
  viewport,
  labelmap: IImageVolume,
  referenceVolume: IImageVolume,
  segmentIndex: number
): any {
  if (referenceVolume.metadata.Modality !== 'PT') {
    return
  }

  if (labelmap.scalarData.length !== referenceVolume.scalarData.length) {
    throw new Error(
      'labelmap and referenceVolume must have the same number of pixels'
    )
  }

  const {
    scalarData: labelmapData,
    dimensions,
    vtkImageData: labelmapImageData,
  } = labelmap

  const {
    scalarData: referenceVolumeData,
    vtkImageData: referenceVolumeImageData,
  } = referenceVolume

  let max = 0
  let maxIJK = [0, 0, 0]

  const callback = ({ pointIJK }) => {
    const offset = referenceVolumeImageData.computeOffsetIndex(pointIJK)
    const value = labelmapData[offset]

    if (value !== segmentIndex) {
      return
    }

    const referenceValue = referenceVolumeData[offset]

    if (referenceValue > max) {
      max = referenceValue
      maxIJK = pointIJK
    }
  }

  pointInShapeCallback(
    undefined,
    labelmapData,
    labelmapImageData,
    dimensions,
    () => true,
    callback
  )

  const camera = viewport.getCamera()
  const { viewUp } = camera

  /**
   * 2. Find the bottom and top of the great circle for the second sphere (1cc sphere)
   * diameter of 12mm = 1.2cm ~ = 1cc sphere
   */
  const diameter = 12
  const secondaryCircleWorld = vec3.create()
  const bottomWorld = vec3.create()
  const topWorld = vec3.create()
  referenceVolumeImageData.indexToWorld(<vec3>maxIJK, secondaryCircleWorld)
  vec3.scaleAndAdd(bottomWorld, secondaryCircleWorld, viewUp, -diameter / 2)
  vec3.scaleAndAdd(topWorld, secondaryCircleWorld, viewUp, diameter / 2)
  const suvPeakCirclePoints = [bottomWorld, topWorld] as [Point3, Point3]

  /**
   * 3. Find the Mean and Max of the 1cc sphere centered on the suv Max of the previous
   * sphere
   */
  let count = 0
  let acc = 0
  const suvPeakMeanCallback = ({ value }) => {
    acc += value
    count += 1
  }

  pointInSurroundingSphereCallback(
    viewport,
    referenceVolume,
    suvPeakCirclePoints,
    suvPeakMeanCallback
  )

  const mean = acc / count

  return {
    max,
    maxIJK,
    mean,
  }
}

export default calculateSuvPeak
