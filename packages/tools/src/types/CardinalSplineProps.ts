import { SplineProps } from './SplineProps';

/**
 * Cardinal spline properties
 */
export type CardinalSplineProps = SplineProps & {
  /** Scale that must be in 0-1 range */
  scale?: number;
  /** Fixed scale used by children classes (Catmull-Rom and Linear splines) */
  fixedScale?: boolean;
};
