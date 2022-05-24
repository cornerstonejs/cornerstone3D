import { VolumeActor } from './IActor';
import Point3 from './Point3';

/**
 * Object containing the min, max and current position in the normal direction
 * for the actor
 */
type ActorSliceRange = {
  actor: VolumeActor;
  viewPlaneNormal: Point3;
  focalPoint: Point3;
  min: number;
  max: number;
  current: number;
};

export default ActorSliceRange;
