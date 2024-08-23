import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type CanvasActor from '../RenderingEngine/CanvasActor';

export type Actor = vtkActor;
export type VolumeActor = vtkVolume;
export type ImageActor = vtkImageSlice;

export type ICanvasActor = CanvasActor;

/**
 * Cornerstone Actor Entry including actor uid, actual Actor, and
 * slabThickness for the actor. ActorEntry is the object that
 * is retrieved from viewport when calling viewport.getActor(s)
 */
export interface ActorEntry {
  /** actor UID */
  uid: string;
  /** actual actor object */
  actor: Actor | VolumeActor | ImageActor | ICanvasActor;
  /** the id of the referenced object (e.g., volume) from which this actor is derived or created*/
  referencedId?: string;
  /** slab thickness for the actor */
  slabThickness?: number;
  /** clipping filter applied to actor surfaces*/
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clippingFilter?: any;
}
