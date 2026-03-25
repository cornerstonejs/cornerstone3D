import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import type CanvasActor from '../RenderingEngine/CanvasActor';
import type CanvasMapper from '../RenderingEngine/CanvasActor/CanvasMapper';
import type { BlendModes } from '../enums';

export type Actor = vtkActor;
export type VolumeActor = vtkVolume;
export type ImageActor = vtkImageSlice;

export type ICanvasActor = CanvasActor;

export interface ActorMapperProxy {
  actor: VolumeActor | ImageActor | ICanvasActor;
  mapper: vtkImageMapper | vtkVolumeMapper | CanvasMapper;
  renderMode: 'vtkImage' | 'vtkVolume' | 'cpu2d' | 'cpuVolume';
}

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
  /** VTK actor/mapper proxy used by compatibility layers such as Viewport V2 */
  actorMapper?: ActorMapperProxy;
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
  /**  */
  [key: string]: unknown;
}
