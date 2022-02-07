import { _cloneDeep } from 'lodash.clonedeep'
import {
  getEnabledElement,
  createAndCacheDerivedVolume,
  createAndCacheLocalVolume,
} from '@ohif/cornerstone-render'

import { Point3 } from '../../types'
import setLabelmapForElement from './setLabelmapForElement'

type LabelmapOptions = {
  volumeUID?: string
  customOptions?: {
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
}

/**
 * Adds a new labelmap to the element based on the options provided.
 * Options include a UID for the labelmap, a custom options object that might include
 * scalarData, metadata, dimensions, spacing, origin, direction, and a targetBuffer type.
 * If no customOptions is provided, it creates an empty labelmap using the default Actor (volume)
 * of the element (viewport)
 *
 * @param  {HTMLCanvasElement} canvas element
 * @param  {number} labelmapIndex   The labelmapIndex to set.
 * @param  {LabelmapOptions} options  Options for creating the labelmap
 * @returns {Promise} string volumeUID of the created labelmap
 */
async function addNewLabelmap({
  canvas,
  labelmapIndex,
  options,
}: {
  canvas: HTMLCanvasElement
  labelmapIndex: number
  options: LabelmapOptions
}): Promise<string> {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    throw new Error('element disabled')
  }

  const { viewport, scene } = enabledElement
  const { volumeUID: labelmapUID, customOptions } = options

  if (!scene) {
    throw new Error('Segmentation not ready for stackViewport')
  }

  // Todo
  // let referenceVolumeUID
  // let referenceImageUID

  let labelmap
  if (customOptions) {
    // create a new labelmap with its own properties
    // This allows creation of a higher resolution labelmap vs reference volume
    const properties = _cloneDeep(options)
    labelmap = await createAndCacheLocalVolume(properties, labelmapUID)
  } else {
    // create a labelmap from a reference volume
    const { uid: volumeUID } = viewport.getDefaultActor()
    labelmap = await createAndCacheDerivedVolume(volumeUID, {
      uid: labelmapUID,
    })
  }

  await setLabelmapForElement({
    canvas: viewport.canvas,
    labelmap: labelmap,
    labelmapIndex,
    labelmapViewportState: undefined,
  })

  return labelmapUID
}

export { addNewLabelmap }
