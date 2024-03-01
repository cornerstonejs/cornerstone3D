import { CardinalSpline } from './CardinalSpline';

// TODO: LinearSpline should inherit from Spline

/**
 * Linear spline matrix is the same one from Cardinal spline with scale equal
 * to 0. Then it can inherit from Spline using the matrix below or inherit from
 * CardinalSpline fixing the scale to 0
 *
 * Transformation Matrix:
 *      1,   0,
 *     -1,  -1,
 */
class LinearSpline extends CardinalSpline {
  constructor() {
    super({ resolution: 0, fixedResolution: true, scale: 0, fixedScale: true });
  }
}

export { LinearSpline as default, LinearSpline };
