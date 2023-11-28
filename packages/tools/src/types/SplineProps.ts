export type SplineProps = {
  /**
   * Resolution of the spline curve
   *
   * The number assigned to the resolution is the number of intermediate points on each
   * curve segment that makes the spline path. For example, if the resolution is set to 0
   * that means that each curve segment will have no intermediate points but only a straight
   * line similar to Linear Spline. For a resolution equal to 20 that means the curve shall
   * have 20 intermediate points or 21 line segments total making it look more like a curve.
   */
  resolution?: number;

  /** Flag that is set to true when the curve is closed */
  closed?: boolean;
};
