import getVoxelThicknessAlongNormal from '../../src/utilities/voxelSlab/getVoxelThicknessAlongNormal';
import {
  isVoxelCenterInSlab,
  projectPointOntoPlane,
  resolveAnnotationThickness,
} from '../../src/utilities/voxelSlab/slabMembership';

/**
 * Brute force reference implementation of Rule M from
 * https://github.com/cornerstonejs/cornerstone3D/issues/2889
 *
 * This is the oracle for every voxel iteration test. It is a deliberately
 * literal, unoptimised transcription of the specification: visit every voxel in
 * the volume, apply the two predicates, keep the ones that pass. It must stay
 * obviously correct rather than fast - the whole point is that the optimised
 * iterator can be checked against something a reader can verify by eye.
 *
 * Do not "improve" this. If it disagrees with the fast iterator, the fast
 * iterator is wrong until proven otherwise.
 *
 * @param {object} options
 * @param {object} options.volume - from createSyntheticVolume
 * @param {[number,number,number]} options.planePoint - `P0`, the annotation plane anchor
 * @param {[number,number,number]} options.normal - `n`, unit length
 * @param {number} [options.annotationThickness] - `T` in mm; defaults to one voxel
 * @param {(projected: number[], ijk: number[], center: number[]) => boolean} [options.isInShape]
 *   The 2D in-shape predicate, receiving the voxel centre projected onto the
 *   annotation plane. Defaults to accepting everything, which isolates the
 *   depth half of the rule.
 * @returns {number[][]} the included voxel indices, in k, j, i order
 */
export function referenceVoxelsInSlab({
  volume,
  planePoint,
  normal,
  annotationThickness,
  isInShape = () => true,
}) {
  const { dimensions, indexToWorld } = volume;
  const voxelThickness = getVoxelThicknessAlongNormal(volume, normal);
  const thickness = resolveAnnotationThickness(
    annotationThickness,
    voxelThickness
  );

  const included = [];

  for (let k = 0; k < dimensions[2]; k++) {
    for (let j = 0; j < dimensions[1]; j++) {
      for (let i = 0; i < dimensions[0]; i++) {
        const center = indexToWorld([i, j, k], [0, 0, 0]);

        // Rule M, part 1: depth.
        if (
          !isVoxelCenterInSlab(
            center,
            planePoint,
            normal,
            thickness,
            voxelThickness
          )
        ) {
          continue;
        }

        // Rule M, part 2: the projection along the normal falls in the shape.
        const projected = projectPointOntoPlane(center, planePoint, normal);
        if (!isInShape(projected, [i, j, k], center)) {
          continue;
        }

        included.push([i, j, k]);
      }
    }
  }

  return included;
}

/**
 * The distinct k indices selected by {@link referenceVoxelsInSlab}, sorted.
 * Convenient for the depth-only cases where the in-plane test accepts
 * everything and only the layer count is interesting.
 */
export function referenceLayers(options) {
  return [...new Set(referenceVoxelsInSlab(options).map(([, , k]) => k))].sort(
    (a, b) => a - b
  );
}

/**
 * Canonicalises a voxel list so two iterators can be compared regardless of
 * visit order, and so duplicates become visible rather than being silently
 * absorbed by a Set.
 */
export function canonicaliseVoxels(voxels) {
  return [...voxels].map(([i, j, k]) => `${i},${j},${k}`).sort();
}
