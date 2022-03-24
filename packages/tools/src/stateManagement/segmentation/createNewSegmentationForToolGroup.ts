import { _cloneDeep } from 'lodash.clonedeep'
import {
  getEnabledElementByUIDs,
  volumeLoader,
  VolumeViewport,
  utilities as csUtils,
} from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'

import { getToolGroupByToolGroupUID } from '../../store/ToolGroupManager'

/**
 * Create a new 3D segmentation volume from the default imageData presented in
 * the first viewport of the toolGroup. It looks at the metadata of the imageData
 * to determine the volume dimensions and spacing if particular options are not provided.
 *
 * @param toolGroupId - The UID of the toolGroup
 * @param options - LabelmapOptions
 * @returns A promise that resolves to the UID of the new labelmap.
 */
async function createNewSegmentationForToolGroup(
  toolGroupId: string,
  options?: {
    volumeId?: string
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
  const toolGroup = getToolGroupByToolGroupUID(toolGroupId)

  if (!toolGroup) {
    throw new Error(`ToolGroup with UID ${toolGroupId} not found`)
  }

  const { viewportId, renderingEngineId } = toolGroup.viewportsInfo[0]

  const enabledElement = getEnabledElementByUIDs(viewportId, renderingEngineId)

  if (!enabledElement) {
    throw new Error('element disabled')
  }

  const { viewport } = enabledElement
  if (!(viewport instanceof VolumeViewport)) {
    throw new Error('Segmentation not ready for stackViewport')
  }

  const { uid } = viewport.getDefaultActor()
  // Name the segmentation volume with the viewport Id
  const segmentationUID = `${uid}-based-segmentation-${
    options?.volumeId ?? csUtils.uuidv4().slice(0, 8)
  }`

  if (options) {
    // create a new labelmap with its own properties
    // This allows creation of a higher resolution labelmap vs reference volume
    const properties = _cloneDeep(options)
    await volumeLoader.createLocalVolume(properties, segmentationUID)
  } else {
    // create a labelmap from a reference volume
    const { uid: volumeId } = viewport.getDefaultActor()
    await volumeLoader.createAndCacheDerivedVolume(volumeId, {
      uid: segmentationUID,
    })
  }

  return segmentationUID
}

export default createNewSegmentationForToolGroup
