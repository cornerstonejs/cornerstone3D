import { vec3 } from 'gl-matrix'
import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'

import { Point3 } from '../../types'
import pointInShapeCallback from '../../util/planar/pointInShapeCallback'
import pointInSurroundingSphereCallback from '../../util/planar/pointInSurroundingSphereCallback'
import { getBoundingBoxAroundShape } from '../segmentation'

export type ToolDataForThresholding = {
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
 * This method calculates the SUV peak on a segmented ROI from a reference PET
 * volume. If a rectangle is provided, the peak is calculated within that
 * rectangle. Otherwise, the calculation is performed on the entire volume which
 * will be slower but same result.
 * @param viewport Viewport to use for the calculation
 * @param labelmap Labelmap from which the mask is taken
 * @param referenceVolume PET volume to use for SUV calculation
 * @param toolData [Optional] list of toolData to use for SUV calculation
 * @param segmentIndex The index of the segment to use for masking
 * @returns
 */
function calculateSuvPeak(
  viewport,
  labelmap: IImageVolume,
  referenceVolume: IImageVolume,
  toolData?: ToolDataForThresholding[],
  segmentIndex = 1
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

  let boundsIJK
  // Todo: using the first tooldata for now
  if (toolData && toolData[0].data?.cachedStats) {
    const { projectionPoints } = toolData[0].data.cachedStats
    const pointsToUse = [].concat(...projectionPoints) // cannot use flat() because of typescript compiler right now

    const rectangleCornersIJK = pointsToUse.map((world) => {
      const ijk = vec3.fromValues(0, 0, 0)
      referenceVolumeImageData.worldToIndex(world, ijk)
      return ijk as Point3
    })

    boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions)
  }

  let max = 0
  let maxIJK = [0, 0, 0]
  let maxLPS = [0, 0, 0]

  const callback = ({ pointIJK, pointLPS }) => {
    const offset = referenceVolumeImageData.computeOffsetIndex(pointIJK)
    const value = labelmapData[offset]

    if (value !== segmentIndex) {
      return
    }

    const referenceValue = referenceVolumeData[offset]

    if (referenceValue > max) {
      max = referenceValue
      maxIJK = pointIJK
      maxLPS = pointLPS
    }
  }

  pointInShapeCallback(
    boundsIJK, // if boundsIJK is not provided then it calculates on the imageData extents
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
    maxLPS,
    mean,
  }
}

export default calculateSuvPeak
