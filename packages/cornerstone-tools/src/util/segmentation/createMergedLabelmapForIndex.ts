import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'
import {
  createLocalVolume,
  Utilities as csUtils,
} from '@precisionmetrics/cornerstone-render'

/**
 * Given a list of labelmaps (with the possibility of overlapping regions), and
 * a segmentIndex it creates a new labelmap with the same dimensions as the input labelmaps,
 * but merges them into a single labelmap for the segmentIndex. It wipes out
 * all other segment Indices. This is useful for calculating statistics regarding
 * a specific segment when there are overlapping regions between labelmap (e.g. TMTV)
 *
 * @param labelmaps - Array of labelmaps
 * @param segmentIndex - The segment index to merge
 * @returns Merged labelmap
 */
function createMergedLabelmapForIndex(
  labelmaps: Array<IImageVolume>,
  segmentIndex = 1,
  uid = 'mergedLabelmap'
): IImageVolume {
  labelmaps.forEach(({ direction, dimensions, origin, spacing }) => {
    if (
      !csUtils.isEqual(dimensions, labelmaps[0].dimensions) ||
      !csUtils.isEqual(direction, labelmaps[0].direction) ||
      !csUtils.isEqual(spacing, labelmaps[0].spacing) ||
      !csUtils.isEqual(origin, labelmaps[0].origin)
    ) {
      throw new Error('labelmaps must have the same size and shape')
    }
  })

  const labelmap = labelmaps[0]

  const arrayType = labelmap.scalarData.constructor
  const outputData = new arrayType(labelmap.scalarData.length)

  labelmaps.forEach((labelmap) => {
    const { scalarData } = labelmap
    for (let i = 0; i < scalarData.length; i++) {
      if (scalarData[i] === segmentIndex) {
        outputData[i] = segmentIndex
      }
    }
  })

  const options = {
    scalarData: outputData,
    metadata: labelmap.metadata,
    spacing: labelmap.spacing,
    origin: labelmap.origin,
    direction: labelmap.direction,
    dimensions: labelmap.dimensions,
  }

  const preventCache = true
  const mergedVolume = createLocalVolume(options, uid, preventCache)

  return mergedVolume
}

export default createMergedLabelmapForIndex
