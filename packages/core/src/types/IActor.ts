import type { vtkVolume } from '@kitware/vtk.js/Rendering/Core/Volume';

/** volume actor which is vtkVolume */
export type VolumeActor = vtkVolume;

/**
 * Cornerstone Actor Entry including actor uid, actual volumeActor, and
 * slabThickness for the actor. Note: actor (and actorEntry) are not
 * the same as volumeActor which is vtkVolume. ActorEntry is the object that
 * is retrieved from viewport when calling viewport.getActor(s)
 */
export type ActorEntry = {
  uid: string;
  volumeActor: VolumeActor;
  slabThickness?: number;
};
