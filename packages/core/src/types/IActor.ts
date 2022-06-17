import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

export type Actor = vtkActor;
export type VolumeActor = vtkVolume;
export type ImageActor = vtkImageSlice;

/**
 * Cornerstone Actor Entry including actor uid, actual Actor, and
 * slabThickness for the actor. ActorEntry is the object that
 * is retrieved from viewport when calling viewport.getActor(s)
 */
export type ActorEntry = {
  uid: string;
  actor: Actor | VolumeActor | ImageActor;
  slabThickness?: number;
};
