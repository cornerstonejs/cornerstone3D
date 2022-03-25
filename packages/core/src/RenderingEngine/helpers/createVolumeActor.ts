import { VolumeActor } from './../../types/IActor'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import { loadVolume } from '../../volumeLoader'
//@ts-ignore
import createVolumeMapper from './createVolumeMapper'
import BlendModes from '../../enums/BlendModes'

interface createVolumeActorInterface {
  volumeId: string
  callback?: ({ volumeActor: any, volumeId: string }) => void
  blendMode?: BlendModes
}

/**
 * Given a volumeId, it creates a vtk volume actor and returns it. If
 * callback is provided, it will be called with the volume actor and the
 * volumeId. If blendMode is provided, it will be set on the volume actor.
 *
 * @param props - createVolumeActorInterface
 * @returns A promise that resolves to a VolumeActor.
 */
async function createVolumeActor(
  props: createVolumeActorInterface
): Promise<VolumeActor> {
  const { volumeId, callback, blendMode } = props

  const imageVolume = await loadVolume(volumeId)

  if (!imageVolume) {
    throw new Error(
      `imageVolume with id: ${imageVolume.volumeId} does not exist`
    )
  }

  const { imageData, vtkOpenGLTexture } = imageVolume

  const volumeMapper = createVolumeMapper(imageData, vtkOpenGLTexture)

  if (blendMode) {
    volumeMapper.setBlendMode(blendMode)
  }

  const volumeActor = vtkVolume.newInstance()
  volumeActor.setMapper(volumeMapper)

  if (callback) {
    callback({ volumeActor, volumeId })
  }

  return volumeActor
}

export default createVolumeActor
