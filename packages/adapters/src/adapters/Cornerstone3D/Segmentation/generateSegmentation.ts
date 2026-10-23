import { normalizers, derivations, data as dcmjsData } from 'dcmjs';
import { Enums } from '@cornerstonejs/core';
import {
  fillSegmentation as fillBitmapSegmentation,
  getSegmentIndexForLabel,
} from '../../Cornerstone/Segmentation_4X';
import {
  encodeFramesToTransferSyntax,
  EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
  getBitmapFramesFromDataset,
} from '../encodePixelData';
import {
  applyPerFrameFunctionalGroups,
  getReferencedSourceImageSequenceItem,
  normalizeSharedFunctionalGroupsSequence,
  setPlaneOrientations,
} from './perFrameFunctionalGroups.js';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';
import { utilities as metadataUtilities } from '@cornerstonejs/metadata';
import { vec3 } from 'gl-matrix';
import { toArray } from '../../helpers/toArray';
import {
  GEOMETRY_TOLERANCE,
  getSourceFrame,
  sliceNormal,
  toFiniteVector,
} from './sourceFrame';
import type { SourceFrame } from './sourceFrame';
import { getFrameOrganization, getFrameStackIds } from './frameOrganization';
import type { FrameOrganization } from './frameOrganization';
import {
  IN_STACK_POSITION_DIMENSION,
  POSITION_DIMENSION,
  STACK_ID_DIMENSION,
  ensurePatientOrientation,
  getStackFrameContents,
  removeDuplicateReferencedInstances,
  removeFrameOfReference,
  removePlaneMacros,
  toConformantSegment,
} from '../../dcmjsSegmentation';
import type { Dimension, FrameContent } from '../../dcmjsSegmentation';

const { isEqual } = metadataUtilities;
const cs3dLogger = cornerstoneUtilities.logger.adaptersLog.getLogger(
  'Cornerstone3D.Segmentation.generateSegmentation'
);

const { MetadataModules } = Enums;
const { SEGImageNormalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;
const LABELMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.7';
const BITMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.4';

interface IOptions {
  predecessorImageId?: string;
  /** False for a source that is not a volume; see getFrameOrganization. */
  isVolumetric?: boolean;
}

type Options = IOptions & {
  [key: string]: number | boolean | unknown | string;
};

function resolveTransferSyntaxUid(options: Options = {}) {
  const transferSyntaxUid =
    (options.transferSyntaxUid as string) ||
    (options.transferSyntaxUID as string);

  if (!transferSyntaxUid) {
    return EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID;
  }

  return transferSyntaxUid;
}

function applySegDatasetTransferSyntax(
  dataset: Record<string, unknown>,
  transferSyntaxUid: string,
  pixelData: unknown,
  pixelDataVR: string
) {
  dataset.PixelData = pixelData;
  dataset._vrMap = (dataset._vrMap as Record<string, string>) || {};
  (dataset._vrMap as Record<string, string>).PixelData = pixelDataVR;
  dataset._meta = (dataset._meta as Record<string, unknown>) || {};
  (
    dataset._meta as Record<string, { Value: string[]; vr: string }>
  ).TransferSyntaxUID = {
    Value: [transferSyntaxUid],
    vr: 'UI',
  };
}

function hasAnySegment(pixelData: ArrayLike<number>) {
  for (let i = 0; i < pixelData.length; i++) {
    if (pixelData[i] !== 0) {
      return true;
    }
  }

  return false;
}

/** Normalizes the labelmaps input to an array of labelmap3D objects. */
function toLabelmap3DArray(inputLabelmaps3D) {
  if (Array.isArray(inputLabelmaps3D)) {
    return inputLabelmaps3D.filter(Boolean);
  }
  return inputLabelmaps3D ? [inputLabelmaps3D] : [];
}

/**
 * Sorted union of frame indices carrying at least one segment across every input
 * labelmap3D. Shared by the export dispatch (to pick referenced images) and by
 * fillLabelmapSegmentation (to build output frames) so the two stay aligned even
 * when more than one labelmap3D is exported.
 */
function collectNonEmptyFrameIndices(labelmap3DArray): number[] {
  const indices = new Set<number>();
  labelmap3DArray.forEach((labelmap3D) => {
    const labelmaps2D = labelmap3D?.labelmaps2D ?? [];
    for (let i = 0; i < labelmaps2D.length; i++) {
      const frame = labelmaps2D[i];
      if (frame?.pixelData && hasAnySegment(frame.pixelData)) {
        indices.add(i);
      }
    }
  });
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Maps stack frame indices that carry segmentation to their referenced cornerstone
 * images. Fails fast when a frame has label data but its source image is not in
 * the cache — silently dropping those frames desynchronizes export geometry.
 */
function resolveReferencedImagesForExport(
  images: Array<{ imageId?: string } | undefined | null>,
  frameIndices: number[]
) {
  if (!frameIndices.length) {
    throw new Error('No non-empty labelmap frames found for SEG export');
  }

  return frameIndices.map((frameIndex) => {
    const image = images[frameIndex];

    if (!image?.imageId) {
      throw new Error(
        `Cannot resolve referenced source image for labelmap stack frame ${frameIndex} ` +
          `(image not loaded in cache). Load the referenced series before storing the segmentation.`
      );
    }

    return image;
  });
}

/** Largest segment value present on any exported frame (decides 8- vs 16-bit). */
function maxSegmentValue(labelmap3DArray, frameIndices: number[]): number {
  let max = 0;
  labelmap3DArray.forEach((labelmap3D) => {
    const labelmaps2D = labelmap3D?.labelmaps2D ?? [];
    frameIndices.forEach((frameIndex) => {
      const pixelData = labelmaps2D[frameIndex]?.pixelData;
      if (!pixelData) {
        return;
      }
      for (let i = 0; i < pixelData.length; i++) {
        const segmentIndex = pixelData[i]
          ? getSegmentIndexForLabel(labelmap3D, pixelData[i])
          : 0;
        if (segmentIndex > max) {
          max = segmentIndex;
        }
      }
    });
  });
  return max;
}

/** Union of segment metadata across all labelmap3D inputs, ascending by number. */
function collectSegmentSequence(labelmap3DArray) {
  const bySegmentNumber = new Map<number, Record<string, unknown>>();
  labelmap3DArray.forEach((labelmap3D) => {
    (labelmap3D?.metadata ?? []).forEach((segment, index) => {
      if (!segment) {
        return;
      }
      const key = Number(segment.SegmentNumber ?? index);
      if (!bySegmentNumber.has(key)) {
        bySegmentNumber.set(key, toConformantSegment(segment));
      }
    });
  });
  return Array.from(bySegmentNumber.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, segment]) => segment);
}

/**
 * Index of `orientation` in `orientations`, within GEOMETRY_TOLERANCE. With
 * `add`, a new orientation is appended; else a new orientation gives -1.
 */
function getOrientationIndex(
  orientations: number[][],
  orientation: number[],
  add = true
): number {
  const index = orientations.findIndex((other) =>
    isEqual(other, orientation, GEOMETRY_TOLERANCE)
  );
  return index === -1 && add ? orientations.push(orientation) - 1 : index;
}

/**
 * The dimensions and the per-frame Frame Content of a LABELMAP SEG (PS3.3
 * C.7.6.16.2.2, C.7.6.17). LABELMAP frames carry many segments, so the
 * dimensions are spatial only:
 *
 * - One orientation and one frame per plane: ImagePositionPatient alone,
 *   ranked along the slice normal.
 * - More than one frame on a plane, or several orientations: one stack per
 *   orientation and per repeat of a plane, indexed by StackID, then
 *   InStackPositionNumber (the rank along the slice normal in the stack).
 *
 * Orientations equal within GEOMETRY_TOLERANCE are the same, as on the import
 * side. In one orientation, the frames sorted along the unit normal start a
 * new plane at a distance of more than GEOMETRY_TOLERANCE from the first frame
 * of the current plane. Frames on one plane can have different in-plane
 * origins. Throws when a frame has no plane, because the frames then have no
 * spatial dimension.
 */
function getLabelmapDimensions(frames: SourceFrame[]): {
  dimensions: Dimension[];
  frameContents: FrameContent[];
  orientations: number[][];
  normals: number[][];
  frameOrientations: number[];
} {
  const missing = frames.findIndex(
    ({ position, orientation }) => !position || !orientation
  );
  if (missing !== -1) {
    throw new Error(
      `Cannot write a LABELMAP SEG: the source image of frame ${missing + 1} ` +
        `has no ImagePositionPatient or ImageOrientationPatient.`
    );
  }

  const orientations: number[][] = [];
  const frameOrientations = frames.map(({ orientation }) =>
    getOrientationIndex(orientations, orientation)
  );
  const normals = orientations.map(sliceNormal);
  const distances = frames.map(({ position }, index) =>
    vec3.dot(normals[frameOrientations[index]] as vec3, position as vec3)
  );

  // Plane numbers increase along the normal in each orientation.
  const planes: number[] = [];
  let planeStart = 0;
  frames
    .map((_, index) => index)
    .sort(
      (a, b) =>
        frameOrientations[a] - frameOrientations[b] ||
        distances[a] - distances[b]
    )
    .forEach((index, i, sorted) => {
      const previous = sorted[i - 1];
      const samePlane =
        i > 0 &&
        frameOrientations[index] === frameOrientations[previous] &&
        distances[index] - planeStart <= GEOMETRY_TOLERANCE;
      if (!samePlane) {
        planeStart = distances[index];
      }
      planes[index] = samePlane
        ? planes[previous]
        : (planes[previous] ?? -1) + 1;
    });

  // The n-th frame on a plane goes in the n-th stack of its orientation.
  const planeCounts: number[] = [];
  const orientationStacks: number[][] = orientations.map(() => []);
  const stacks: number[][] = [];
  frames.forEach((_, index) => {
    const repeat = planeCounts[planes[index]] ?? 0;
    planeCounts[planes[index]] = repeat + 1;
    const stackIndexes = orientationStacks[frameOrientations[index]];
    stackIndexes[repeat] ??= stacks.push([]) - 1;
    stacks[stackIndexes[repeat]].push(index);
  });

  const frameContents: FrameContent[] = [];
  stacks.forEach((stack, stackIndex) => {
    [...stack]
      .sort((a, b) => planes[a] - planes[b])
      .forEach((frameIndex, rank) => {
        frameContents[frameIndex] =
          stacks.length === 1
            ? { DimensionIndexValues: [rank + 1] }
            : {
                StackID: String(stackIndex + 1),
                InStackPositionNumber: rank + 1,
                DimensionIndexValues: [stackIndex + 1, rank + 1],
              };
      });
  });

  return {
    dimensions:
      stacks.length === 1
        ? [POSITION_DIMENSION]
        : [STACK_ID_DIMENSION, IN_STACK_POSITION_DIMENSION],
    frameContents,
    orientations,
    normals,
    frameOrientations,
  };
}

/**
 * The gap between adjacent planes of the source series, for each orientation
 * and its unit normal: the mean gap when all gaps agree within 1%. The gap is
 * undefined when the series has fewer than two planes in that orientation, or
 * when the gaps differ by more than 1%, for example at a missing slice.
 */
function getSourceSliceSpacings(
  sourceImages,
  metadata,
  orientations: number[][],
  normals: number[][]
): Array<number | undefined> {
  const distances: number[][] = orientations.map(() => []);
  sourceImages.forEach((image) => {
    const { position, orientation } = getSourceFrame(image, metadata);
    const index =
      position && orientation
        ? getOrientationIndex(orientations, orientation, false)
        : -1;
    if (index !== -1) {
      distances[index].push(vec3.dot(normals[index] as vec3, position as vec3));
    }
  });

  return distances.map((planes) => {
    planes.sort((a, b) => a - b);
    const gaps = planes
      .slice(1)
      .map((distance, index) => distance - planes[index])
      .filter((gap) => gap > GEOMETRY_TOLERANCE);
    if (!gaps.length) {
      return undefined;
    }
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    return gaps.every((gap) => Math.abs(gap - mean) <= mean * 0.01)
      ? mean
      : undefined;
  });
}

const PIXEL_MEASURE_KEYS = [
  'PixelSpacing',
  'SliceThickness',
  'SpacingBetweenSlices',
];

const isSameMeasure = (a, b) => a === b || isEqual(a, b, GEOMETRY_TOLERANCE);

/**
 * Sets the Pixel Measures of a LABELMAP SEG from the source images. The
 * normalizer takes Pixel Spacing from the first source image only, and takes
 * Slice Thickness and Spacing Between Slices from the gap between the first
 * two exported frames. That gap is 0 for one frame, and too large when the
 * segmented slices are not adjacent.
 *
 * For each frame:
 * - Pixel Spacing comes from its source image, else from the normalizer, and
 *   is absent when neither is a pair of numbers.
 * - Slice Thickness comes from its source image, else it is the source slice
 *   spacing of that orientation, else it is absent.
 * - With `includeSliceSpacing`, Spacing Between Slices (Type 3) is the source
 *   slice spacing of that orientation (see getSourceSliceSpacings). When that
 *   spacing is undefined, the export logs a warning and omits the attribute,
 *   because a wrong spacing misplaces the frames in a reader.
 *
 * When all frames have the same Pixel Measures, the shared group holds them.
 * Otherwise the per-frame groups hold them, because a macro is never in both
 * groups (PS3.3 C.7.6.16).
 *
 * @returns The per-frame Pixel Measures, or undefined when the shared group
 *   holds them.
 */
function applyLabelmapPixelMeasures(
  dataset,
  frames: SourceFrame[],
  frameOrientations: number[],
  sliceSpacings: Array<number | undefined>,
  includeSliceSpacing: boolean
): Array<Record<string, unknown>> | undefined {
  const shared = dataset.SharedFunctionalGroupsSequence;
  const {
    SliceThickness: _thickness,
    SpacingBetweenSlices: _spacing,
    PixelSpacing: normalizerPixelSpacing,
    ...derived
  } = toArray(shared.PixelMeasuresSequence)[0] ?? {};

  // The normalizer can hold strings or a single value; only a pair of finite
  // numbers is a Pixel Spacing.
  const derivedPixelSpacing = toFiniteVector(normalizerPixelSpacing, 2);
  let spacingMissing = false;
  const pixelMeasures = frames.map((frame, index) => {
    const sliceSpacing = sliceSpacings[frameOrientations[index]];
    const measures: Record<string, unknown> = { ...derived };
    const pixelSpacing = frame.pixelSpacing ?? derivedPixelSpacing;
    if (pixelSpacing) {
      measures.PixelSpacing = pixelSpacing;
    }
    const sliceThickness = frame.sliceThickness ?? sliceSpacing;
    if (sliceThickness !== undefined) {
      measures.SliceThickness = sliceThickness;
    }
    if (includeSliceSpacing) {
      if (sliceSpacing === undefined) {
        spacingMissing = true;
      } else {
        measures.SpacingBetweenSlices = sliceSpacing;
      }
    }
    return measures;
  });

  if (spacingMissing) {
    cs3dLogger.warn(
      'generateSegmentation: includeSliceSpacing is set, but the source ' +
        'slices are not evenly spaced, there is only one slice, or not all ' +
        'source images are loaded; the LABELMAP SEG omits Spacing Between ' +
        'Slices.'
    );
  }

  const [first] = pixelMeasures;
  const same = pixelMeasures.every((measures) =>
    PIXEL_MEASURE_KEYS.every((key) => isSameMeasure(measures[key], first[key]))
  );
  if (same) {
    if (Object.keys(first).length) {
      shared.PixelMeasuresSequence = first;
    } else {
      delete shared.PixelMeasuresSequence;
    }
    return undefined;
  }

  delete shared.PixelMeasuresSequence;
  return pixelMeasures;
}

/**
 * Fills a derived SEG dataset as a LABELMAP SEG with the non-empty frames of
 * the labelmaps.
 *
 * Every frame must reference a resolvable source SOP Instance UID, and in the
 * `volume` organization must have a plane. The function throws otherwise and
 * drops no frame, because a dropped frame makes the per-frame functional
 * groups disagree with the encoded PixelData. These checks run before the
 * pixel data is encoded. Error messages give 1-based frame numbers.
 *
 * The `stack` organization (see FrameOrganization) writes stacks in source
 * order, with no Frame of Reference, no plane macros and no slice spacing.
 *
 * @param sourceImages - The full source series, for the slice spacing. Empty
 *   when not all source images are loaded.
 * @param stackIds - The StackID of each frame for the `stack` organization,
 *   for example the time point of a 4D source (see getFrameStackIds).
 */
function fillLabelmapSegmentation(
  segmentation,
  inputLabelmaps3D,
  metadata,
  images,
  options: Options = {},
  sourceImages = images,
  organization: FrameOrganization = 'volume',
  stackIds: string[] = images.map(() => '1')
) {
  const isStack = organization === 'stack';
  const labelmap3DArray = toLabelmap3DArray(inputLabelmaps3D);
  const segmentSequence = collectSegmentSequence(labelmap3DArray);
  const validFrameIndices = collectNonEmptyFrameIndices(labelmap3DArray);

  if (!validFrameIndices.length) {
    throw new Error('No non-empty labelmap frames found for SEG export');
  }

  // Frame geometry comes from the first labelmap that actually carries the first
  // exported frame (all input labelmaps share the source stack's grid).
  const firstFrame = labelmap3DArray
    .map((labelmap3D) => labelmap3D?.labelmaps2D?.[validFrameIndices[0]])
    .find(Boolean);
  const rows = firstFrame.rows;
  const columns = firstFrame.columns;
  const frameLength = rows * columns;
  const numberOfFrames = validFrameIndices.length;

  // >255 labels cannot fit in 8 bits; widen to 16-bit rather than wrapping mod 256.
  const maxValue = maxSegmentValue(labelmap3DArray, validFrameIndices);
  const useUint16 = maxValue > 255;
  const FrameArray = useUint16 ? Uint16Array : Uint8Array;
  const bitsAllocated = useUint16 ? 16 : 8;
  let overlapWarned = false;

  const buildExportFrame = (frameIndex: number) => {
    const frame = new FrameArray(frameLength);

    labelmap3DArray.forEach((labelmap3D) => {
      const source = labelmap3D?.labelmaps2D?.[frameIndex]?.pixelData;
      if (!source) {
        return;
      }
      const len = Math.min(source.length, frameLength);
      for (let i = 0; i < len; i++) {
        if (source[i] === 0) {
          continue;
        }
        const value = getSegmentIndexForLabel(labelmap3D, source[i]);
        if (frame[i] !== 0 && frame[i] !== value && !overlapWarned) {
          cs3dLogger.warn(
            'generateSegmentation: overlapping labelmap segments detected on the ' +
              'same voxel while exporting a LABELMAP SEG; the later labelmap wins.'
          );
          overlapWarned = true;
        }
        frame[i] = value;
      }
    });

    return frame;
  };

  // Reference and geometry checks run before the encode; see the doc comment.
  const frames = images.map((image, outputIndex) => {
    const sourceImageSequenceItem = getReferencedSourceImageSequenceItem(
      image,
      metadata
    );

    if (!sourceImageSequenceItem?.ReferencedSOPInstanceUID) {
      throw new Error(
        `Cannot resolve a source ReferencedSOPInstanceUID for labelmap SEG ` +
          `frame ${outputIndex + 1}. Refusing to write a SEG with unreliable ` +
          `source image references.`
      );
    }

    return {
      ...getSourceFrame(image, metadata, true),
      sourceImageSequenceItem,
    };
  });
  // derive() organizes the dimensions for BINARY (Referenced Segment Number,
  // then position), which does not apply to LABELMAP frames.
  const {
    dimensions,
    frameContents,
    orientations,
    normals,
    frameOrientations,
  } = isStack
    ? {
        dimensions: [STACK_ID_DIMENSION, IN_STACK_POSITION_DIMENSION],
        frameContents: getStackFrameContents(stackIds),
        orientations: [],
        normals: [],
        frameOrientations: frames.map(() => 0),
      }
    : getLabelmapDimensions(frames);

  const { dataset } = segmentation;
  dataset.NumberOfFrames = numberOfFrames;
  dataset.Rows = rows;
  dataset.Columns = columns;
  dataset.SOPClassUID = LABELMAP_SEG_SOP_CLASS_UID;
  dataset.SegmentationType = 'LABELMAP';
  if (segmentSequence.length) {
    dataset.SegmentSequence = segmentSequence;
  }
  dataset.BitsAllocated = useUint16 ? '16' : '8';
  dataset.BitsStored = useUint16 ? '16' : '8';
  dataset.HighBit = useUint16 ? '15' : '7';
  dataset.PixelRepresentation = '0';
  delete dataset.MaximumFractionalValue;
  delete dataset.SegmentationFractionalType;
  dataset.SpecificCharacterSet = 'ISO_IR 192';
  dataset._vrMap ||= {};

  const transferSyntaxUid = resolveTransferSyntaxUid(options);
  const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
    transferSyntaxUID: transferSyntaxUid,
    buildFrame: (outputIndex) =>
      buildExportFrame(validFrameIndices[outputIndex]),
    frameCount: validFrameIndices.length,
    bitsAllocated,
    columns,
  });

  applySegDatasetTransferSyntax(
    dataset,
    transferSyntaxUid,
    pixelData,
    pixelDataVR
  );

  dataset._meta ||= {};
  dataset._meta.MediaStorageSOPClassUID = {
    Value: [LABELMAP_SEG_SOP_CLASS_UID],
    vr: 'UI',
  };

  dataset.SourceImageSequence = frames.map(
    ({ sourceImageSequenceItem }) => sourceImageSequenceItem
  );

  const dimensionOrganizationUID =
    toArray(dataset.DimensionOrganizationSequence)[0]
      ?.DimensionOrganizationUID ?? dcmjsData.DicomMetaDictionary.uid();
  dataset.DimensionOrganizationSequence = {
    DimensionOrganizationUID: dimensionOrganizationUID,
  };
  dataset.DimensionIndexSequence = dimensions.map((dimension) => ({
    DimensionOrganizationUID: dimensionOrganizationUID,
    ...dimension,
  }));

  normalizeSharedFunctionalGroupsSequence(dataset);
  delete dataset.SharedFunctionalGroupsSequence.PlanePositionSequence;
  // Only Spacing Between Slices and a missing Slice Thickness use the spacing.
  // A stack has no slice spacing.
  const includeSliceSpacing = !isStack && Boolean(options.includeSliceSpacing);
  const sliceSpacings =
    !isStack &&
    (includeSliceSpacing ||
      frames.some(({ sliceThickness }) => sliceThickness === undefined))
      ? getSourceSliceSpacings(sourceImages, metadata, orientations, normals)
      : [];
  const perFramePixelMeasures = applyLabelmapPixelMeasures(
    dataset,
    frames,
    frameOrientations,
    sliceSpacings,
    includeSliceSpacing
  );

  // derive() leaves the per-frame groups empty; build each one from scratch.
  // A LABELMAP frame holds many segments, so it has no
  // SegmentIdentificationSequence (no referencedSegmentNumber).
  dataset.PerFrameFunctionalGroupsSequence = [];
  applyPerFrameFunctionalGroups(
    dataset,
    frames.map(({ position, sourceImageSequenceItem }, index) => ({
      sourceImageSequenceItem,
      planePositionSequence: isStack
        ? undefined
        : { ImagePositionPatient: position },
      pixelMeasuresSequence: perFramePixelMeasures?.[index],
      frameContent: frameContents[index],
    }))
  );
  if (isStack) {
    removePlaneMacros(dataset);
    removeFrameOfReference(dataset);
  } else {
    setPlaneOrientations(
      dataset,
      frames.map(({ orientation }) => orientation)
    );
  }

  const sopInstanceUIDs = new Set(
    frames.map(
      ({ sourceImageSequenceItem }) =>
        sourceImageSequenceItem.ReferencedSOPInstanceUID
    )
  );
  const referencedSeriesSequence = dataset.ReferencedSeriesSequence;
  const referencedSeries = Array.isArray(referencedSeriesSequence)
    ? referencedSeriesSequence[0]
    : referencedSeriesSequence;

  if (referencedSeries?.ReferencedInstanceSequence && sopInstanceUIDs.size) {
    const referencedInstances = Array.isArray(
      referencedSeries.ReferencedInstanceSequence
    )
      ? referencedSeries.ReferencedInstanceSequence
      : [referencedSeries.ReferencedInstanceSequence];

    referencedSeries.ReferencedInstanceSequence = referencedInstances.filter(
      (instance) =>
        instance?.ReferencedSOPInstanceUID &&
        sopInstanceUIDs.has(instance.ReferencedSOPInstanceUID)
    );
  }
  removeDuplicateReferencedInstances(dataset);
  ensurePatientOrientation(dataset);

  return segmentation;
}

/**
 * generateSegmentation - Generates a DICOM Segmentation object given cornerstoneTools data.
 *
 * @param images - An array of the cornerstone image objects, which includes imageId and metadata
 * @param labelmaps - An array of the 3D Volumes that contain the segmentation data.
 *   Each labelmap3D can have `labelToSegmentIndex`, the map from a voxel value
 *   to the segment index, for a layer that stores a segment under another label
 *   value. The export applies the map and does not copy the voxels.
 * @param options.sopClassUID - Output SEG SOP Class UID. Defaults to BINARY
 *   Segmentation (`1.2.840.10008.5.1.4.1.1.66.4`) for broad PACS/viewer
 *   compatibility. Pass the Label Map Segmentation UID
 *   (`1.2.840.10008.5.1.4.1.1.66.7`, added to DICOM in 2024) to opt into that
 *   newer class — note many receivers still reject it. (OHIF selects this via the
 *   `segmentation.store.defaultMode` datasource customization.)
 * @param options.isVolumetric - Set false for a source that is not a volume.
 *   A LABELMAP SEG of such a source, of a 4D source, or of a source without a
 *   Frame of Reference is one stack without patient geometry; see
 *   getFrameOrganization.
 */
function generateSegmentation(
  images,
  labelmaps,
  metadata,
  options: Options = {}
) {
  const requestedSOPClassUID =
    (options?.sopClassUID as string) || BITMAP_SEG_SOP_CLASS_UID;
  const shouldExportBitmap = requestedSOPClassUID === BITMAP_SEG_SOP_CLASS_UID;

  if (shouldExportBitmap) {
    const transferSyntaxUid = resolveTransferSyntaxUid(options);

    // Build the derivation from the full, unfiltered images. dcmjs'
    // addSegmentFromLabelmap references the source geometry by the ORIGINAL
    // labelmap frame index (referencedDataset.PerFrameFunctionalGroupsSequence
    // and ReferencedInstanceSequence are indexed by frameNumber - 1). Filtering
    // out empty frames here would shorten those arrays and index out of bounds
    // (TypeError) the moment any leading/interior frame is empty — e.g. a lesion
    // that starts on slice 10. fillSegmentation is likewise passed full images.
    const segmentation = _createMultiframeSegmentationFromReferencedImages(
      images,
      metadata,
      options
    );
    const segmentationResult = fillBitmapSegmentation(
      segmentation,
      labelmaps,
      {
        ...options,
        transferSyntaxUid: EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
        skipTransferSyntaxMeta: true,
      },
      images,
      metadata
    );
    const { frames, bitsAllocated } = getBitmapFramesFromDataset(
      segmentationResult.dataset
    );
    const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
      transferSyntaxUID: transferSyntaxUid,
      frames,
      bitsAllocated,
      columns: Number(segmentationResult.dataset.Columns) || undefined,
    });

    applySegDatasetTransferSyntax(
      segmentationResult.dataset,
      transferSyntaxUid,
      pixelData,
      pixelDataVR
    );
    segmentationResult.dataset.SOPClassUID = BITMAP_SEG_SOP_CLASS_UID;
    ensurePatientOrientation(segmentationResult.dataset);
    segmentationResult.dataset._meta ||= {};
    segmentationResult.dataset._meta.MediaStorageSOPClassUID = {
      Value: [BITMAP_SEG_SOP_CLASS_UID],
      vr: 'UI',
    };

    const predecessorImageId = options?.predecessorImageId;
    if (predecessorImageId) {
      const predecessor = metadata.get(
        MetadataModules.PREDECESSOR_SEQUENCE,
        predecessorImageId
      );
      // Onto the dataset, which is what gets stored, not onto its wrapper.
      Object.assign(segmentationResult.dataset, predecessor);
    }

    return segmentationResult;
  }

  // Union of non-empty frames across ALL labelmap3D inputs — the same basis
  // fillLabelmapSegmentation uses — so the referenced/derived images line up with
  // the frames actually written.
  const nonEmptyFrameIndices = collectNonEmptyFrameIndices(
    toLabelmap3DArray(labelmaps)
  );
  const filteredImages = resolveReferencedImagesForExport(
    images,
    nonEmptyFrameIndices
  );
  const organization = getFrameOrganization(filteredImages, metadata, options);

  const segmentation = _createMultiframeSegmentationFromReferencedImages(
    filteredImages,
    metadata,
    options,
    organization === 'stack'
  );
  const segmentationResult = fillLabelmapSegmentation(
    segmentation,
    labelmaps,
    metadata,
    filteredImages,
    options,
    // An image that is not loaded looks like a gap, so the slice spacing
    // needs the full source series.
    images.every((image) => image?.imageId) ? images : [],
    organization,
    organization === 'stack'
      ? getFrameStackIds(
          images.filter((image) => image?.imageId),
          filteredImages
        )
      : undefined
  );

  const predecessorImageId = options?.predecessorImageId;
  if (predecessorImageId) {
    const predecessor = metadata.get(
      MetadataModules.PREDECESSOR_SEQUENCE,
      predecessorImageId
    );
    // Onto the dataset, for the same reason as the bitmap branch above.
    Object.assign(segmentationResult.dataset, predecessor);
  }
  return segmentationResult;
}

/**
 * _createMultiframeSegmentationFromReferencedImages - description
 *
 * @param images - An array of the cornerstone image objects related to the reference
 * series that the segmentation is derived from. You can use methods such as
 * volume.getCornerstoneImages() to get this array.
 *
 * @param options - the options object for the SegmentationDerivation.
 * @param placeholderGeometry - Gives each image a placeholder position along
 *   one axis, in image order, and the default orientation. The dcmjs
 *   normalizer needs a position and an orientation for every image, and sorts
 *   by position. A stack export removes the geometry afterwards.
 * @returns The Seg derived dataSet.
 */
function _createMultiframeSegmentationFromReferencedImages(
  images,
  metadata,
  options,
  placeholderGeometry = false
) {
  if (!images?.length || !images[0]?.imageId) {
    throw new Error(
      'Cannot create SEG derivation: no referenced source images were resolved.'
    );
  }

  const studyImageId = options?.predecessorImageId || images[0].imageId;
  const studyData = metadata.get(MetadataModules.STUDY_DATA, studyImageId);
  const datasets = images.map((image, index) => {
    const { imageId } = image;
    const seriesData = metadata.get(MetadataModules.SERIES_DATA, imageId);
    const imageData = metadata.get(MetadataModules.IMAGE_DATA, imageId);
    return {
      ...studyData,
      ...seriesData,
      ...imageData,
      ...(placeholderGeometry && {
        ImagePositionPatient: [0, 0, index],
        ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
      }),
      // Each virtual dataset is a single frame, so declare it as 1 frame even
      // when the source is a multiframe instance
      NumberOfFrames: 1,
      PixelData: image.voxelManager.getScalarData(),
      // Declaring it as 16 bits allows the normalizer to work on 8 bit data
      BitsAllocated: 16,
      _vrMap: {
        PixelData: 'OW',
      },
      _meta: {},
    };
  });

  const isSingleNonMultiFrame =
    datasets.length === 1 && !(datasets[0].NumberOfFrames > 1);
  if (isSingleNonMultiFrame) {
    // The normalizer doesn't handle just a single image correctly, but
    // the segmentation version needs a multiframe object even for a single
    // frame instance, so duplicate the object temporarily
    datasets.push(datasets[0]);
  }
  // Directly use the SEGImageNormalizer to allow creating a SEG virtual instance consisting of
  // whatever instance data we happen to have since this isn't actually creating
  // a real multiframe, but rather a reference object
  const normalizer = new SEGImageNormalizer(datasets);
  normalizer.normalize();
  const { dataset: multiframe } = normalizer;

  if (!multiframe) {
    throw new Error(
      'Failed to normalize the multiframe dataset, the data is not multi-frame.'
    );
  }

  normalizeSharedFunctionalGroupsSequence(multiframe);
  multiframe.SharedFunctionalGroupsSequence.PixelMeasuresSequence ||= {};
  multiframe.PerFrameFunctionalGroupsSequence ||= [];
  for (let index = 0; index < images.length; index++) {
    multiframe.PerFrameFunctionalGroupsSequence[index] ||= {
      PlanePositionSequence: {},
      PlaneOrientationSequence: {},
    };
  }
  if (isSingleNonMultiFrame) {
    multiframe.PerFrameFunctionalGroupsSequence = [
      multiframe.PerFrameFunctionalGroupsSequence[0],
    ];
    multiframe.NumberOfFrames = 1;
  }
  return new SegmentationDerivation([multiframe], options);
}

export {
  generateSegmentation,
  // Exported for unit testing the LABELMAP export frame/segment/bit-depth logic.
  toLabelmap3DArray,
  collectNonEmptyFrameIndices,
  resolveReferencedImagesForExport,
  maxSegmentValue,
  collectSegmentSequence,
};
