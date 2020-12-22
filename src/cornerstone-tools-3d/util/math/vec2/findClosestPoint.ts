import {Point2} from '../../../types'
import { vec2 } from 'gl-matrix';

/**
 * @function findClosestPoint Given a set of sources, find which one is closest
 * to the target point.
 *
 * @param {Array<Point2>} sources The potential source points.
 * @param {Point2} target The target point, used to find the closest source.
 * @returns {Point2} The closest point in [sources].
 */
export default function findClosestPoint(sources: Array<Point2>, target: Point2) : Point2{
  const distances = [];
  let minDistance;

  const targetVec2 = vec2.create();

  vec2.set(targetVec2, target[0], target[1])

  sources.forEach(function (source, index) {
    const sourceVec2 = vec2.create();


    vec2.set(sourceVec2, source[0], source[1])


    const d = vec2.distance(sourceVec2, targetVec2);

    distances.push(d);

    if (index === 0) {
      minDistance = d;
    } else {
      minDistance = Math.min(d, minDistance);
    }
  });

  const index = distances.indexOf(minDistance);

  return sources[index];
}
