import { vtkVolume } from 'vtk.js/Sources/Rendering/Core/Volume'

export type VolumeActor = vtkVolume

export type ActorEntry = {
  uid: string
  volumeActor: VolumeActor
  slabThickness?: number
}
