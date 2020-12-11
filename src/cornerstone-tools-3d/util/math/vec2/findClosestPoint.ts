import { vec2 } from 'gl-matrix';

export default function findClosestPoint(sources, target) {
  const distances = [];
  let minDistance;

  sources.forEach(function(source, index) {
    const d = vec2.distance(source, target);

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
