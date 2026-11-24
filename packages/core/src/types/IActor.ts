import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type CanvasActor from '../RenderingEngine/CanvasActor';
import type { BlendModes } from '../enums';

export type Actor = vtkActor;
export type VolumeActor = vtkVolume;
export type ImageActor = vtkImageSlice;

export type ICanvasActor = CanvasActor;

/**
 * Cornerstone Actor Entry including actor uid, actual Actor, and
 * slabThickness for the actor. ActorEntry is the object that
 * is retrieved from viewport when calling viewport.getActors() or
 * viewport.getDefaultActor()
 */
export interface ActorEntry {
  /** actor UID */
  uid: string;
  /** actual actor object */
  actor: Actor | VolumeActor | ImageActor | ICanvasActor;
  /**
   * The display set that this actor draws, as the viewport mounted it. The
   * layer of `viewport.getRenderPlan()` with the same `displaySetId` says how
   * the actor is drawn.
   */
  displaySetId?: string;
  /** the id of the referenced object (e.g., volume) from which this actor is derived or created*/
  referencedId?: string;
  /** slab thickness for the actor */
  slabThickness?: number;
  /** clipping filter applied to actor surfaces*/
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clippingFilter?: any;
  /** blend mode */
  blendMode?: BlendModes;
  /** callbacks that run after actor creation */
  callbacks?: ({
    volumeActor,
    volumeId,
  }: {
    volumeActor: VolumeActor;
    volumeId: string;
  }) => void;
  /**
   * When true, viewport fidelity ignores this actor (FIDELITY-STATE-9).
   * Tools set this on labelmap / segmentation overlay actors.
   */
  excludeFromFidelity?: boolean;
  /**  */
  [key: string]: unknown;
}
