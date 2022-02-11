import { vtkVolume } from 'vtk.js/Sources/Rendering/Core/Volume'

type VolumeInputCallback = (params: {
  volumeActor: vtkVolume
  volumeUID: string
}) => void

type IVolumeInput = {
  volumeUID: string
  visibility?: boolean
  callback?: VolumeInputCallback
  blendMode?: string
  slabThickness?: number
}

export type { IVolumeInput, VolumeInputCallback }
