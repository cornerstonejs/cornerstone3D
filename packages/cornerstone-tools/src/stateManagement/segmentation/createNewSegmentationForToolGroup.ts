import { _cloneDeep } from 'lodash.clonedeep'
import {
  getEnabledElementByUIDs,
  volumeLoader,
  VolumeViewport,
  utilities as csUtils,
} from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

import { getToolGroupByToolGroupUID } from '../../store/ToolGroupManager'

/**
 * Create a new 3D segmentation volume from the default imageData presented in
 * the first viewport of the toolGroup. It looks at the metadata of the imageData
 * to determine the volume dimensions and spacing if particular options are not provided.
 *
 * @param toolGroupUID - The UID of the toolGroup
 * @param options - LabelmapOptions
 * @returns A promise that resolves to the UID of the new labelmap.
 */
async function createNewSegmentationForToolGroup(
  toolGroupUID: string,
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
  const toolGroup = getToolGroupByToolGroupUID(toolGroupUID)

  if (!toolGroup) {
    throw new Error(`ToolGroup with UID ${toolGroupUID} not found`)
  }

  const { viewportUID, renderingEngineUID } = toolGroup.viewportsInfo[0]

  const enabledElement = getEnabledElementByUIDs(
    viewportUID,
    renderingEngineUID
  )

  if (!enabledElement) {
    throw new Error('element disabled')
  }

  const { viewport } = enabledElement
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
    await volumeLoader.createLocalVolume(properties, segmentationUID)
  } else {
    // create a labelmap from a reference volume
    const { uid: volumeUID } = viewport.getDefaultActor()
    await volumeLoader.createAndCacheDerivedVolume(volumeUID, {
      uid: segmentationUID,
    })
  }

  return segmentationUID
}

export default createNewSegmentationForToolGroup
