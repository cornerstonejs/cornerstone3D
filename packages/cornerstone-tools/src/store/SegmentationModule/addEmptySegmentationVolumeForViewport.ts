import { _cloneDeep } from 'lodash.clonedeep'
import {
  getEnabledElement,
  createAndCacheDerivedVolume,
  createLocalVolume,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'

import { Point3 } from '../../types'
import setLabelmapForElement from './setLabelmapForElement'
import { getNextLabelmapIndex } from './activeLabelmapController'

type LabelmapOptions = {
  volumeUID?: string
  scalarData?: Float32Array | Uint8Array
  targetBuffer?: {
    type: 'Float32Array' | 'Uint8Array'
  }
  metadata?: any
  dimensions?: Point3
  spacing?: Point3
  origin?: Point3
  direction?: Float32Array
}
/**
 * It renders a labelmap 3D volume into the viewport that the element belongs to
 * @param {element, labelmap, callback, labelmapIndex, immediateRender}
 */
async function addEmptySegmentationVolumeForViewport(
  viewport: VolumeViewport,
  options?: LabelmapOptions
): Promise<string> {
  const { element } = viewport
  const enabledElement = getEnabledElement(element)

  if (!enabledElement) {
    throw new Error('element disabled')
  }

  if (!(viewport instanceof VolumeViewport)) {
    throw new Error('Segmentation not ready for stackViewport')
  }

  // Create a new labelmap at the labelmapIndex, If there is no labelmap at that index
  const { uid } = viewport.getDefaultActor()
  const segmentationIndex = getNextLabelmapIndex(element)
  const segmentationUID = `${viewport.uid}:-${uid}-segmentation-${segmentationIndex}`

  let segmentation
  if (options) {
    // create a new labelmap with its own properties
    // This allows creation of a higher resolution labelmap vs reference volume
    const properties = _cloneDeep(options)
    segmentation = await createLocalVolume(properties, segmentationUID)
  } else {
    // create a labelmap from a reference volume
    const { uid: volumeUID } = viewport.getDefaultActor()
    segmentation = await createAndCacheDerivedVolume(volumeUID, {
      uid: segmentationUID,
    })
  }

  await setLabelmapForElement({
    element: viewport.element,
    labelmap: segmentation,
    labelmapIndex: segmentationIndex,
  })

  return segmentationUID
}

export default addEmptySegmentationVolumeForViewport
