import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

export type Actor = vtkActor;
export type VolumeActor = vtkVolume;
export type ImageActor = vtkImageSlice;

export interface ICanvasActor {
  render(viewport, context): void;

  getMapper();

  getProperty();

  isA(actorType): boolean;

  getClassName(): string;
}

/**
 * Cornerstone Actor Entry including actor uid, actual Actor, and
 * slabThickness for the actor. ActorEntry is the object that
 * is retrieved from viewport when calling viewport.getActor(s)
 */
export type ActorEntry = {
  /** actor UID */
  uid: string;
  /** actual actor object */
  actor: Actor | VolumeActor | ImageActor | ICanvasActor;
  /** the id of the reference volume from which this actor is derived or created*/
  referenceId?: string;
  /** slab thickness for the actor */
  slabThickness?: number;
  /** clipping filter applied to actor surfaces*/
  clippingFilter?: any;
};
