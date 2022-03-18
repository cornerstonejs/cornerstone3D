import { _cloneDeep } from 'lodash.clonedeep'
import {
  getEnabledElement,
  createAndCacheDerivedVolume,
  createLocalVolume,
  VolumeViewport,
  Utilities as csUtils,
} from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

/**
 * Create a new 3D segmentation volume from the default imageData presented in the
 * viewport. It looks at the metadata of the imageData to determine the volume
 * dimensions and spacing if particular options are not provided.
 *
 * @param viewport - VolumeViewport
 * @param options - LabelmapOptions
 * @returns A promise that resolves to the UID of the new labelmap.
 */
async function createNewSegmentationForViewport(
  viewport: VolumeViewport,
  options?: {
    volumeUID?: string
    scalarData?: Float32Array | Uint8Array
    targetBuffer?: {
      type: 'Float32Array' | 'Uint8Array'
    }
    metadata?: any
    dimensions?: Types.Point3
    spacing?: Types.Point3
    origin?: Types.Point3
    direction?: Float32Array
  }
): Promise<string> {
  const { element } = viewport
  const enabledElement = getEnabledElement(element)

  if (!enabledElement) {
    throw new Error('element disabled')
  }

  if (!(viewport instanceof VolumeViewport)) {
    throw new Error('Segmentation not ready for stackViewport')
  }

  const { uid } = viewport.getDefaultActor()
  // Name the segmentation volume with the viewport UID
  const segmentationUID = `${uid}-based-segmentation-${
    options?.volumeUID ?? csUtils.uuidv4().slice(0, 8)
  }`

  if (options) {
    // create a new labelmap with its own properties
    // This allows creation of a higher resolution labelmap vs reference volume
    const properties = _cloneDeep(options)
    await createLocalVolume(properties, segmentationUID)
  } else {
    // create a labelmap from a reference volume
    const { uid: volumeUID } = viewport.getDefaultActor()
    await createAndCacheDerivedVolume(volumeUID, {
      uid: segmentationUID,
    })
  }

  return segmentationUID
}

export default createNewSegmentationForViewport
