import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'
import { createAndCacheLocalVolume } from '@precisionmetrics/cornerstone-render'
import isEqual from '../math/vec3/isEqual'

/**
 * Given a list of labelmaps (with the possibility of overlapping regions),
 * it generates a new labelmap with the same dimensions as the input labelmaps,
 * by merging all the overlapping regions. This methods can be used
 * to avoid double counting the segments in more than one labelmaps
 *
 * @param {} labelmaps
 * @param {number} segmentIndex
 * @returns {number} TMTV in ml
 */
function createMergedLabelmap(
  labelmaps: Array<IImageVolume>,
  segmentIndex = 1, // The segment index to use for the merged labelmap
  uid = 'mergedLabelmap'
): IImageVolume {
  labelmaps.forEach(({ direction, dimensions, origin, spacing }) => {
    if (
      !isEqual(dimensions, labelmaps[0].dimensions) ||
      !isEqual(direction, labelmaps[0].direction) ||
      !isEqual(spacing, labelmaps[0].spacing) ||
      !isEqual(origin, labelmaps[0].origin)
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
  const mergedVolume = createAndCacheLocalVolume(options, uid, preventCache)

  return mergedVolume
}

export default createMergedLabelmap
