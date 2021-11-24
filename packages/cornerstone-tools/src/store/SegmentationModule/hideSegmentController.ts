import { getLabelmapsStateForElement } from './state'

import { getEnabledElement } from '@precisionmetrics/cornerstone-render'

/**
 * Toggles the visibility of a segmentation
 * @param element HTML element
 * @param labelmapUID UID of the labelmap to toggle
 * @returns
 */
function toggleSegmentationVisibility(
  element: HTMLElement,
  labelmapUID?: string
): void {
  const { labelmaps } = getLabelmapsStateForElement(element)
  const { scene } = getEnabledElement(element)

  let labelmapsToUpdate = labelmaps

  if (labelmapUID) {
    labelmapsToUpdate = labelmaps.filter((l) => l.volumeUID === labelmapUID)
  }

  labelmapsToUpdate.forEach((labelmap) => {
    const { visibility, volumeUID } = labelmap
    const volumeActor = scene.getVolumeActor(volumeUID)

    if (!volumeActor) {
      throw new Error(`Volume actor for labelmapUID ${labelmapUID} not found`)
    }

    // toggle visibility for the labelmap
    const visibilityToSet = !visibility
    volumeActor.setVisibility(visibilityToSet)
    labelmap.visibility = visibilityToSet
    scene.render()
  })
}

export { toggleSegmentationVisibility }
