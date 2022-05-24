import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

export type Actor = vtkActor;
export type VolumeActor = vtkVolume;

/**
 * Cornerstone Actor Entry including actor uid, actual Actor, and
 * slabThickness for the actor. ActorEntry is the object that
 * is retrieved from viewport when calling viewport.getActor(s)
 */
export type ActorEntry = {
  uid: string;
  actor: Actor;
  slabThicknessEnabled?: boolean;
  slabThickness?: number;
};
