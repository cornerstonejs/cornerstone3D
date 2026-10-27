/**
 * The volume test of an image display set, from its naturalized instances
 * alone (no imageIds, no metadata providers), so a server gets the same
 * answer as a viewer. It gives the answer of OHIF `isDisplaySetReconstructable`
 * (`isReconstructable`); the plane, the spacing and the lattice come from the
 * `planeGeometry` series function.
 *
 * @module displayset/isReconstructableInstances
 */

import {
  asArrayFirst,
  toFiniteFirst,
  toFiniteVector,
} from '@cornerstonejs/utils';
import { readOwn } from '../safeFunctions';
import { planeGeometry } from './seriesFunctions';
import type { PlaneGeometry } from './seriesFunctions';
import type { NaturalizedInstance } from './types';

/** The spacing tolerance of OHIF: a slice may be 20% off the lattice. */
const SPACING_TOLERANCE = 0.2;

/** The first item of a sequence, naturalized as an array or as one item. */
const item = (value: unknown): unknown => asArrayFirst(value as unknown[]);

/** A vector read from `field` of the first item of each sequence of `path`. */
function vectorAt(
  source: unknown,
  path: readonly string[],
  field: string,
  length: number
): number[] | undefined {
  let current = source;
  for (const sequence of path) {
    current = item(readOwn(current, sequence));
  }
  return toFiniteVector(readOwn(current, field), length);
}

/** The plane geometry of `positions`, read in one orientation. */
function geometryOf(
  positions: readonly (number[] | undefined)[],
  orientation: number[] | undefined
): PlaneGeometry {
  return planeGeometry(
    positions.map((ImagePositionPatient, index) => ({
      SOPInstanceUID: String(index),
      ImagePositionPatient,
      ImageOrientationPatient: orientation,
    })),
    { args: { tolerance: SPACING_TOLERANCE } }
  ) as PlaneGeometry;
}

/**
 * Single-frame instances: two or more, all with a position and the same rows,
 * columns, samples per pixel and orientation, at two or more locations, and
 * every slice on one regular lattice (a missing slice is allowed; two slices
 * at one location are not).
 */
function isSingleFrameVolume(
  instances: readonly NaturalizedInstance[]
): boolean {
  if (instances.length < 2) {
    return false;
  }
  const [first] = instances;
  const same = (name: string) => (instance: NaturalizedInstance) =>
    toFiniteFirst(readOwn(instance, name)) ===
    toFiniteFirst(readOwn(first, name));
  if (
    !instances.every(same('Rows')) ||
    !instances.every(same('Columns')) ||
    !instances.every(same('SamplesPerPixel'))
  ) {
    return false;
  }
  // A missing position or orientation, or another orientation, is irregular.
  const geometry = planeGeometry([...instances], {
    args: { tolerance: SPACING_TOLERANCE },
  }) as PlaneGeometry;
  return (
    geometry.irregularCount === 0 &&
    geometry.positions >= 2 &&
    !geometry.duplicates
  );
}

/** The frame positions: per frame when two or more are known, else shared. */
function framePositions(
  instance: NaturalizedInstance
): (number[] | undefined)[] {
  const perFrame = asArrayFromSequence(
    readOwn(instance, 'PerFrameFunctionalGroupsSequence')
  ).map((group) =>
    vectorAt(group, ['PlanePositionSequence'], 'ImagePositionPatient', 3)
  );
  if (perFrame.filter(Boolean).length >= 2) {
    return perFrame;
  }
  const shared = vectorAt(
    instance,
    ['SharedFunctionalGroupsSequence', 'PlanePositionSequence'],
    'ImagePositionPatient',
    3
  );
  const count = toFiniteFirst(instance.NumberOfFrames, perFrame.length);
  return shared ? new Array(count).fill(shared) : [];
}

function asArrayFromSequence(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

/**
 * One multi-frame instance: pixel spacing, an orientation and a position are
 * known; an NM instance is a reconstructed tomo; and the frames are not all at
 * one location (a cine of one location is not a volume).
 */
function isMultiFrameVolume(instance: NaturalizedInstance): boolean {
  const perFrame0 = item(readOwn(instance, 'PerFrameFunctionalGroupsSequence'));
  const shared = item(readOwn(instance, 'SharedFunctionalGroupsSequence'));
  const detector = item(readOwn(instance, 'DetectorInformationSequence'));
  const hasPixelMeasures =
    readOwn(perFrame0, 'PixelMeasuresSequence') != null ||
    readOwn(shared, 'PixelMeasuresSequence') != null ||
    (instance.PixelSpacing != null &&
      (instance.SliceThickness != null ||
        instance.SpacingBetweenFrames != null));
  const orientation =
    toFiniteVector(instance.ImageOrientationPatient, 6) ??
    vectorAt(
      shared,
      ['PlaneOrientationSequence'],
      'ImageOrientationPatient',
      6
    ) ??
    vectorAt(
      perFrame0,
      ['PlaneOrientationSequence'],
      'ImageOrientationPatient',
      6
    ) ??
    toFiniteVector(readOwn(detector, 'ImageOrientationPatient'), 6);
  const hasPosition =
    readOwn(perFrame0, 'PlanePositionSequence') != null ||
    readOwn(perFrame0, 'CTPositionSequence') != null ||
    instance.ImagePositionPatient != null ||
    readOwn(detector, 'ImagePositionPatient') != null;
  if (!hasPixelMeasures || !orientation || !hasPosition) {
    return false;
  }
  if (String(instance.Modality ?? '').includes('NM')) {
    const subType = asArrayFromSequence(instance.ImageType)[2];
    if (subType !== 'RECON TOMO' && subType !== 'RECON GATED TOMO') {
      return false;
    }
  }
  const positions = framePositions(instance);
  // Fewer than two known positions: one location cannot be shown.
  if (positions.filter(Boolean).length < 2) {
    return true;
  }
  return geometryOf(positions, orientation).positions >= 2;
}

/**
 * True when the instances of an image display set form a volume: the answer of
 * OHIF `isDisplaySetReconstructable` for the same instances.
 *
 * - Single-frame: two or more instances of one size, samples per pixel and
 *   orientation, at two or more locations, on one regular slice lattice (20%
 *   tolerance; a missing slice is allowed, two slices at one location are not).
 * - Multi-frame (the first instance has more than one frame): that instance has
 *   pixel spacing, an orientation and a position; an NM instance is a
 *   reconstructed tomo; and its frames are not all at one location.
 *
 * There is no modality list: OHIF decides by geometry too.
 */
export function isReconstructableInstances(
  instances: readonly NaturalizedInstance[]
): boolean {
  const defined = instances.filter(Boolean);
  if (!defined.length) {
    return false;
  }
  return toFiniteFirst(defined[0].NumberOfFrames, 0) > 1
    ? isMultiFrameVolume(defined[0])
    : isSingleFrameVolume(defined);
}
