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

  /**
   * Fixed resolution (Linear spline)
   *
   * Splines with `fixedResolution` set to true shall attempt to change the
   * resolution (eg: spline.resolution = 10). That is useful, for example, for
   * linear splines because having more line segments between two control points
   * would not change its resolution and that is why it is fixed to 0.
   */
  fixedResolution?: boolean;

  /** Flag that is set to true when the curve is closed */
  closed?: boolean;
};
