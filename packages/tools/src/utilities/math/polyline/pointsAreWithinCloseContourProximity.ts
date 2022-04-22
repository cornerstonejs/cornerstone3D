import { vec2 } from 'gl-matrix';

const pointsAreWithinCloseContourProximity = (
  point1,
  point2,
  closeContourProximity
): boolean => {
  return vec2.dist(point1, point2) < closeContourProximity;
};

export default pointsAreWithinCloseContourProximity;
