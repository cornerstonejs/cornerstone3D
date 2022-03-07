import { VolumeActor } from './../../types/IActor'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import { loadVolume } from '../../volumeLoader'
//@ts-ignore
import createVolumeMapper from './createVolumeMapper'

interface createVolumeActorInterface {
  volumeUID: string
  callback?: ({ volumeActor: any, volumeUID: string }) => void
  blendMode?: string
}

/**
 * Given a volumeUID, it creates a vtk volume actor and returns it. If
 * callback is provided, it will be called with the volume actor and the
 * volumeUID. If blendMode is provided, it will be set on the volume actor.
 *
 * @param props - createVolumeActorInterface
 * @returns A promise that resolves to a VolumeActor.
 */
async function createVolumeActor(
  props: createVolumeActorInterface
): Promise<VolumeActor> {
  const { volumeUID, callback, blendMode } = props

  const imageVolume = await loadVolume(volumeUID)

  if (!imageVolume) {
    throw new Error(`imageVolume with uid: ${imageVolume.uid} does not exist`)
  }

  const { imageData, vtkOpenGLTexture } = imageVolume

  const volumeMapper = createVolumeMapper(imageData, vtkOpenGLTexture)

  if (blendMode) {
    volumeMapper.setBlendMode(blendMode)
  }

  const volumeActor = vtkVolume.newInstance()
  volumeActor.setMapper(volumeMapper)

  if (callback) {
    callback({ volumeActor, volumeUID })
  }

  return volumeActor
}

export default createVolumeActor
