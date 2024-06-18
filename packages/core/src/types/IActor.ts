import * as vtkActorModule from '@kitware/vtk.js/Rendering/Core/Actor.js';
import * as vtkImageSliceModule from '@kitware/vtk.js/Rendering/Core/ImageSlice.js';
import * as vtkVolumeModule from '@kitware/vtk.js/Rendering/Core/Volume.js';

export type Actor = vtkActorModule.vtkActor;
export type VolumeActor = vtkVolumeModule.vtkVolume;
export type ImageActor = vtkImageSliceModule.vtkImageSlice;

/**
 * Cornerstone Actor Entry including actor uid, actual Actor, and
 * slabThickness for the actor. ActorEntry is the object that
 * is retrieved from viewport when calling viewport.getActor(s)
 */
export type ActorEntry = {
  /** actor UID */
  uid: string;
  /** actual actor object */
  actor: Actor | VolumeActor | ImageActor;
  /** the id of the reference volume from which this actor is derived or created*/
  referenceId?: string;
  /** slab thickness for the actor */
  slabThickness?: number;
  /** clipping filter applied to actor surfaces*/
  clippingFilter?: any;
};
