import { Point3 } from '../types';

type Orientation = {
  /** Slice Normal for the viewport - the normal that points in the opposite direction of the slice normal out of screen and is negative of direction of projection */
  sliceNormal: Point3;
  /** viewUp direction for the viewport - the vector that points from bottom to top of the viewport */
  viewUp: Point3;
};

export default Orientation;
