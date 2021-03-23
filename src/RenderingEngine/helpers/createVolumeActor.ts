import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import { loadVolume } from '../../volumeLoader'
//@ts-ignore
import createVolumeMapper from './createVolumeMapper'

interface createVolumeActorInterface {
  volumeUID: string
  callback?: Function
  blendMode?: string
}

async function createVolumeActor(props: createVolumeActorInterface) {
  const { volumeUID, callback, blendMode } = props

  // todo: use getVolume?
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
  volumeActor.setMapper(volumeMapper)

  if (callback) {
    callback({ volumeActor, volumeUID })
  }

  return volumeActor
}

export default createVolumeActor
