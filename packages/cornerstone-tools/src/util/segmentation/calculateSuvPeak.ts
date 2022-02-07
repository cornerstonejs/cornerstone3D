import { vec3 } from 'gl-matrix'
import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'

import { getBoundingBoxAroundShape } from '../segmentation'
import { RectangleRoiThresholdToolData } from '../../tools/segmentation/RectangleRoiThreshold'
import { Point3, Point2 } from '../../types'
import pointInShapeCallback from '../../util/planar/pointInShapeCallback'
import triggerLabelmapRender from './triggerLabelmapRender'

/** */
function calculateSuvPeak(
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

  const yMultiple = dimensions[0]
  const zMultiple = dimensions[0] * dimensions[1]

  // loop inside the scalardata
  // if the labelmap pixel is the same as the segmentIndex
  // add the reference pixel to the sum

  // let max = 0
  // let index = 0
  // for (let i = 0; i < labelmapData.length; i++) {
  //   if (labelmapData[i] !== segmentIndex) {
  //     continue
  //   }

  //   const referenceValue = referenceData[i]

  //   if (referenceValue > max) {
  //     max = referenceValue
  //     index = i
  //   }
  // }

  let max = 0
  let maxIJK = [0, 0, 0]

  const callback = (canvasCoords, pointIJK, index, newValue) => {
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
    viewport.worldToCanvas,
    scalarData,
    labelmapImageData,
    dimensions,
    () => true,
    callback
  )

  // Get the bounds of the segmentIndex?
  // inShapeCallback to get the maximum
  // on the maximum draw 1cc
  // in shapeCallback to calculate mean
}

export default calculateSuvPeak
