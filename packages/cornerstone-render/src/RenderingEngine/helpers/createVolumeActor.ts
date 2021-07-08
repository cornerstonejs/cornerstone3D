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

async function createVolumeActor(
  props: createVolumeActorInterface
): Promise<VolumeActor> {
  const { volumeUID, callback, blendMode } = props

  const imageVolume = await loadVolume(volumeUID)

  if (!imageVolume) {
    throw new Error(`imageVolume with uid: ${imageVolume.uid} does not exist`)
  }

  const { vtkImageData, vtkOpenGLTexture } = imageVolume

  const volumeMapper = createVolumeMapper(vtkImageData, vtkOpenGLTexture)

  if (blendMode) {
    volumeMapper.setBlendMode(blendMode)
  }

  const volumeActor = vtkVolume.newInstance()
  // volumeActor.getProperty().setInterpolationTypeToNearest()
  volumeActor.setMapper(volumeMapper)

  if (callback) {
    callback({ volumeActor, volumeUID })
  }

  return volumeActor
}

export default createVolumeActor
