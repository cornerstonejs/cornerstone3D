import type { VolumeActor } from './IActor';
import type Point3 from './Point3';

/**
 * Object containing the min, max and current position in the normal direction
 * for the actor
 */
interface ActorSliceRange {
  actor: VolumeActor;
  viewPlaneNormal: Point3;
  focalPoint: Point3;
  min: number;
  max: number;
  current: number;
}

export type { ActorSliceRange as default };
