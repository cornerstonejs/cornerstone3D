// Given a measurement event, returns the correct info for displaying
export default function getToolDetailForDisplay(eventDetail) {
  const { toolData } = eventDetail

  const { data, metadata } = toolData
  const { cachedStats } = data
  const detail = {
    viewportUID: eventDetail.viewportUID,
    stats: {},
    toolName: metadata.toolName,
    toolId: metadata.toolDataUID,
  }

  const targetUIDs = Object.keys(cachedStats)

  targetUIDs.forEach((targetUID) => {
    const stat = cachedStats[targetUID]
    const index = targetUID.indexOf(':')
    const target = targetUID.substring(index + 1)

    if (metadata.toolName === 'Length') {
      detail.stats[`${target}-length`] = stat.length
    }

    if (metadata.toolName === 'Bidirectional') {
      detail.stats[`${target}-length`] = stat.length
      detail.stats[`${target}-width`] = stat.width
    }

    if (metadata.toolName === 'Probe') {
      const { value, SUVBw, SUVLbm, SUVBsa, Modality } = stat

      if (Modality === 'PT') {
        // Check if we have scaling for the other 2 SUV types for the PET.
        // If we have scaling, value should be undefined
        if (value) {
          detail.stats[`${target}: SUV`] = value
        } else {
          detail.stats[`${target}-SUV bw`] = SUVBw

          if (SUVLbm) {
            detail.stats[`${target}-SUV lbm`] = SUVLbm
          }
          if (SUVBsa) {
            detail.stats[`${target}-SUV bsa`] = SUVBsa
          }
        }
      } else if (Modality === 'CT') {
        detail.stats[`${target}-HU`] = value
      } else {
        detail.stats[`${target}-MO`] = value
      }
    }

    if (metadata.toolName === 'RectangleRoi') {
      detail.stats[`${target}-area`] = stat.area
      detail.stats[`${target}-mean`] = stat.mean
      detail.stats[`${target}-std`] = stat.stdDev
    }

    if (metadata.toolName === 'EllipticalRoi') {
      detail.stats[`${target}-area`] = stat.area
      detail.stats[`${target}-mean`] = stat.mean
      detail.stats[`${target}-std`] = stat.stdDev
    }
  })

  return detail
}
