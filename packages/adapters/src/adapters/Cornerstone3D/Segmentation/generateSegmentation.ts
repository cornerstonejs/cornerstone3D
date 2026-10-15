import { normalizers, derivations, data as dcmjsData } from 'dcmjs';
import { Enums } from '@cornerstonejs/core';
import { fillSegmentation as fillBitmapSegmentation } from '../../Cornerstone/Segmentation_4X';
import {
  encodeFramesToTransferSyntax,
  EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
  getBitmapFramesFromDataset,
} from '../encodePixelData';
import {
  applyPerFrameFunctionalGroups,
  getReferencedSourceImageSequenceItem,
  normalizeSharedFunctionalGroupsSequence,
} from './perFrameFunctionalGroups.js';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import { toArray } from '../../helpers/toArray';

const { isEqual } = cornerstoneUtilities;
const cs3dLogger = cornerstoneUtilities.logger.adaptersLog.getLogger(
  'Cornerstone3D.Segmentation.generateSegmentation'
);

const { MetadataModules } = Enums;
const { SEGImageNormalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;
const LABELMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.7';
const BITMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.4';
const IMAGE_POSITION_PATIENT_TAG = 0x00200032;
const PLANE_POSITION_SEQUENCE_TAG = 0x00209113;
const STACK_ID_TAG = 0x00209056;
const IN_STACK_POSITION_NUMBER_TAG = 0x00209057;
const FRAME_CONTENT_SEQUENCE_TAG = 0x00209111;
// Per-component tolerance (mm, or cosine) for the same position or orientation.
const GEOMETRY_TOLERANCE = 1e-3;

interface IOptions {
  predecessorImageId?: string;
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
        if (pixelData[i] > max) {
          max = pixelData[i];
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
        bySegmentNumber.set(key, { ...segment });
      }
    });
  });
  return Array.from(bySegmentNumber.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, segment]) => segment);
}

/** `values` as `length` finite numbers, or undefined. */
function toFiniteNumbers(values, length: number): number[] | undefined {
  const numbers = Array.isArray(values) ? values.map(Number) : [];
  return numbers.length === length && numbers.every(Number.isFinite)
    ? numbers
    : undefined;
}

/**
 * Builds the per-frame PlanePositionSequence / PlaneOrientationSequence for a
 * LABELMAP SEG frame from its source image's imagePlaneModule, or from the
 * instance's ImagePositionPatient / ImageOrientationPatient when the module
 * has no value.
 *
 * dcmjs' derive() resets PerFrameFunctionalGroupsSequence to [], so the seeded
 * plane groups on the input multiframe are gone by the time we fill the output.
 * Without these, exported LABELMAP frames carry no spatial position and are not
 * localizable (Slicer / highdicom / dcmqi reject or misplace them). Rebuild them
 * here from the referenced source image, which is the authoritative geometry.
 */
function getPlaneSequencesForImage(
  image: { imageId?: string } | undefined,
  metadata
): {
  planePositionSequence?: { ImagePositionPatient: number[] };
  planeOrientationSequence?: { ImageOrientationPatient: number[] };
} {
  const imagePlane =
    metadata?.get?.(MetadataModules.IMAGE_PLANE, image?.imageId) ?? {};
  const instance =
    metadata?.get?.(MetadataModules.IMAGE_DATA, image?.imageId) ?? {};
  const { rowCosines, columnCosines } = imagePlane;

  const position =
    toFiniteNumbers(imagePlane.imagePositionPatient, 3) ??
    toFiniteNumbers(instance.ImagePositionPatient, 3);
  const orientation =
    toFiniteNumbers(imagePlane.imageOrientationPatient, 6) ??
    (Array.isArray(rowCosines) && Array.isArray(columnCosines)
      ? toFiniteNumbers([...rowCosines, ...columnCosines], 6)
      : undefined) ??
    toFiniteNumbers(instance.ImageOrientationPatient, 6);

  return {
    ...(position && {
      planePositionSequence: { ImagePositionPatient: position },
    }),
    ...(orientation && {
      planeOrientationSequence: { ImageOrientationPatient: orientation },
    }),
  };
}

const sliceNormal = (orientation: number[]) =>
  vec3.cross(
    [0, 0, 0],
    orientation.slice(0, 3) as vec3,
    orientation.slice(3, 6) as vec3
  ) as number[];

interface FrameGeometry {
  position?: number[];
  orientation?: number[];
}

interface FrameContent {
  DimensionIndexValues: number[];
  StackID?: string;
  InStackPositionNumber?: number;
}

const POSITION_DIMENSION = {
  DimensionIndexPointer: IMAGE_POSITION_PATIENT_TAG,
  FunctionalGroupPointer: PLANE_POSITION_SEQUENCE_TAG,
  DimensionDescriptionLabel: 'ImagePositionPatient',
};
const STACK_ID_DIMENSION = {
  DimensionIndexPointer: STACK_ID_TAG,
  FunctionalGroupPointer: FRAME_CONTENT_SEQUENCE_TAG,
  DimensionDescriptionLabel: 'StackID',
};
const IN_STACK_POSITION_DIMENSION = {
  DimensionIndexPointer: IN_STACK_POSITION_NUMBER_TAG,
  FunctionalGroupPointer: FRAME_CONTENT_SEQUENCE_TAG,
  DimensionDescriptionLabel: 'InStackPositionNumber',
};

/**
 * The dimensions and the per-frame Frame Content of a LABELMAP SEG (PS3.3
 * C.7.6.16.2.2, C.7.6.17). LABELMAP frames carry many segments, so the
 * dimensions are spatial only:
 *
 * - One orientation and distinct positions: ImagePositionPatient alone, ranked
 *   along the slice normal.
 * - Repeated positions or several orientations: one stack per orientation and
 *   per repeat of a position, indexed by StackID, then InStackPositionNumber
 *   (the rank along the slice normal in the stack).
 *
 * Positions and orientations equal within GEOMETRY_TOLERANCE are the same, as
 * on the import side. Distances along the normal are quantized to that
 * tolerance, so coplanar frames tie and keep their frame order. Throws when a
 * frame has no plane, because the frames then have no spatial dimension.
 */
function getLabelmapDimensions(frames: FrameGeometry[]): {
  dimensions: Array<typeof POSITION_DIMENSION>;
  frameContents: FrameContent[];
  orientations: number[][];
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
  const stacks: Array<{ orientation: number; frames: number[] }> = [];
  frames.forEach(({ position, orientation }, frameIndex) => {
    let orientationIndex = orientations.findIndex((other) =>
      isEqual(other, orientation, GEOMETRY_TOLERANCE)
    );
    if (orientationIndex === -1) {
      orientationIndex = orientations.push(orientation) - 1;
    }
    let stackIndex = stacks.findIndex(
      (stack) =>
        stack.orientation === orientationIndex &&
        !stack.frames.some((other) =>
          isEqual(frames[other].position, position, GEOMETRY_TOLERANCE)
        )
    );
    if (stackIndex === -1) {
      stackIndex =
        stacks.push({ orientation: orientationIndex, frames: [] }) - 1;
    }
    stacks[stackIndex].frames.push(frameIndex);
  });

  const frameContents: FrameContent[] = [];
  stacks.forEach((stack, stackIndex) => {
    const normal = sliceNormal(orientations[stack.orientation]);
    const distance = (frameIndex: number) =>
      Math.round(
        vec3.dot(normal as vec3, frames[frameIndex].position as vec3) /
          GEOMETRY_TOLERANCE
      );
    [...stack.frames]
      .sort((a, b) => distance(a) - distance(b) || a - b)
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
  };
}

/** The source image's Slice Thickness, or undefined when it has none. */
function getSourceSliceThickness(image, metadata): number | undefined {
  const sliceThickness = Number(
    metadata?.get?.(MetadataModules.IMAGE_PLANE, image?.imageId)
      ?.sliceThickness ??
      metadata?.get?.(MetadataModules.IMAGE_DATA, image?.imageId)
        ?.SliceThickness
  );
  return sliceThickness > 0 ? sliceThickness : undefined;
}

/**
 * The mean gap between adjacent planes of the source series with the given
 * orientation, or undefined when the series has fewer than two such planes or
 * the gaps differ by more than 1%.
 */
function getSourceSliceSpacing(
  sourceImages,
  metadata,
  orientation: number[]
): number | undefined {
  const normal = sliceNormal(orientation);
  const distances = [];
  sourceImages.forEach((image) => {
    const { planePositionSequence, planeOrientationSequence } =
      getPlaneSequencesForImage(image, metadata);
    if (
      planePositionSequence &&
      isEqual(
        planeOrientationSequence?.ImageOrientationPatient,
        orientation,
        GEOMETRY_TOLERANCE
      )
    ) {
      distances.push(
        vec3.dot(
          normal as vec3,
          planePositionSequence.ImagePositionPatient as vec3
        )
      );
    }
  });
  distances.sort((a, b) => a - b);
  const gaps = distances
    .slice(1)
    .map((distance, index) => distance - distances[index])
    .filter((gap) => gap > GEOMETRY_TOLERANCE);
  if (!gaps.length) {
    return undefined;
  }
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  return gaps.every((gap) => Math.abs(gap - mean) <= mean * 0.01)
    ? mean
    : undefined;
}

/**
 * Sets the Pixel Measures of a LABELMAP SEG from the source series. The
 * normalizer derives Slice Thickness and Spacing Between Slices from the gap
 * between the first two exported frames: 0 for a single frame, and the gap
 * between segmented slices when they are not adjacent.
 *
 * Spacing Between Slices (Type 3) is removed when the source has no uniform
 * spacing, and Slice Thickness when no source image has one. When the source
 * images have different thicknesses, Pixel Measures moves to the per-frame
 * groups, because a macro is never in both groups (PS3.3 C.7.6.16).
 *
 * @returns The per-frame Pixel Measures, or undefined when the shared group
 *   holds them.
 */
function applyLabelmapPixelMeasures(
  dataset,
  images,
  sourceImages,
  metadata,
  orientations: number[][]
): Array<Record<string, unknown>> | undefined {
  const shared = dataset.SharedFunctionalGroupsSequence;
  const { SliceThickness: _derived, ...pixelMeasures } =
    toArray(shared.PixelMeasuresSequence)[0] ?? {};

  if ('SpacingBetweenSlices' in pixelMeasures) {
    const spacing =
      orientations.length === 1
        ? getSourceSliceSpacing(sourceImages, metadata, orientations[0])
        : undefined;
    if (spacing) {
      pixelMeasures.SpacingBetweenSlices = spacing;
    } else {
      delete pixelMeasures.SpacingBetweenSlices;
    }
  }

  const thicknesses = images.map((image) =>
    getSourceSliceThickness(image, metadata)
  );
  const [first] = thicknesses;
  const sameThickness = thicknesses.every(
    (thickness) =>
      thickness === first ||
      (thickness !== undefined &&
        first !== undefined &&
        Math.abs(thickness - first) <= GEOMETRY_TOLERANCE)
  );

  if (sameThickness) {
    shared.PixelMeasuresSequence =
      first === undefined
        ? pixelMeasures
        : { ...pixelMeasures, SliceThickness: first };
    return undefined;
  }

  delete shared.PixelMeasuresSequence;
  return thicknesses.map((thickness) =>
    thickness === undefined
      ? { ...pixelMeasures }
      : { ...pixelMeasures, SliceThickness: thickness }
  );
}

function fillLabelmapSegmentation(
  segmentation,
  inputLabelmaps3D,
  metadata,
  images,
  options: Options = {},
  sourceImages = images
) {
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
        const value = source[i];
        if (value === 0) {
          continue;
        }
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

  const sourceImageSequence = images
    .map((image) => getReferencedSourceImageSequenceItem(image, metadata))
    .filter((item) => item.ReferencedSOPInstanceUID);

  if (sourceImageSequence.length) {
    dataset.SourceImageSequence = sourceImageSequence;
  }

  // Every SEG frame must reference a resolvable source SOP Instance UID.
  // Reject rather than silently dropping frames, otherwise the per-frame
  // functional groups would disagree with the encoded PixelData and produce a
  // SEG with unreliable source image references.
  const perFrameInputs = validFrameIndices.map((_, outputIndex) => {
    const image = images[outputIndex];
    const sourceImageSequenceItem = getReferencedSourceImageSequenceItem(
      image,
      metadata
    );

    if (!sourceImageSequenceItem?.ReferencedSOPInstanceUID) {
      throw new Error(
        `Cannot resolve a source ReferencedSOPInstanceUID for labelmap SEG ` +
          `frame ${outputIndex}. Refusing to write a SEG with unreliable ` +
          `source image references.`
      );
    }

    // The source image's imagePlaneModule is the authoritative geometry. dcmjs
    // wipes PerFrameFunctionalGroupsSequence in derive(), so the prior group is
    // normally empty; only fall back to it when the source image lacks a plane.
    const priorGroup =
      dataset.PerFrameFunctionalGroupsSequence?.[outputIndex] ?? {};
    const planeSequences = getPlaneSequencesForImage(image, metadata);

    return {
      // LABELMAP frames carry multiple segment labels as pixel values, so the
      // SegmentIdentificationSequence macro must be absent (a fixed
      // ReferencedSegmentNumber would be wrong for labels >= 2). Omitting
      // referencedSegmentNumber keeps applyPerFrameFunctionalGroups from emitting it.
      sourceImageSequenceItem,
      planeOrientationSequence:
        planeSequences.planeOrientationSequence ??
        priorGroup?.PlaneOrientationSequence,
      planePositionSequence:
        planeSequences.planePositionSequence ??
        priorGroup?.PlanePositionSequence,
    };
  });

  const geometry = perFrameInputs.map((frame) => ({
    position: toFiniteNumbers(
      toArray(frame.planePositionSequence)[0]?.ImagePositionPatient,
      3
    ),
    orientation: toFiniteNumbers(
      toArray(frame.planeOrientationSequence)[0]?.ImageOrientationPatient,
      6
    ),
  }));
  // derive() organizes the dimensions for BINARY (Referenced Segment Number,
  // then position), which does not apply to LABELMAP frames.
  const { dimensions, frameContents, orientations } =
    getLabelmapDimensions(geometry);
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

  // A macro is in the shared or the per-frame groups, never both (PS3.3
  // C.7.6.16): one orientation is shared, several are per frame.
  normalizeSharedFunctionalGroupsSequence(dataset);
  const shared = dataset.SharedFunctionalGroupsSequence;
  delete shared.PlanePositionSequence;
  if (orientations.length === 1) {
    shared.PlaneOrientationSequence = {
      ImageOrientationPatient: orientations[0],
    };
  } else {
    delete shared.PlaneOrientationSequence;
  }
  const perFramePixelMeasures = applyLabelmapPixelMeasures(
    dataset,
    images,
    sourceImages,
    metadata,
    orientations
  );

  // perFrameInputs already hold what the prior groups had.
  dataset.PerFrameFunctionalGroupsSequence = [];
  applyPerFrameFunctionalGroups(
    dataset,
    perFrameInputs.map((frame, index) => {
      const { position, orientation } = geometry[index];
      return {
        sourceImageSequenceItem: frame.sourceImageSequenceItem,
        planePositionSequence: { ImagePositionPatient: position },
        planeOrientationSequence:
          orientations.length > 1
            ? { ImageOrientationPatient: orientation }
            : undefined,
        pixelMeasuresSequence: perFramePixelMeasures?.[index],
        frameContent: frameContents[index],
      };
    })
  );

  const sopInstanceUIDs = new Set(
    images
      .map(
        (image) =>
          metadata.get(MetadataModules.IMAGE_DATA, image?.imageId)
            ?.SOPInstanceUID
      )
      .filter(Boolean)
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

  return segmentation;
}

/**
 * generateSegmentation - Generates a DICOM Segmentation object given cornerstoneTools data.
 *
 * @param images - An array of the cornerstone image objects, which includes imageId and metadata
 * @param labelmaps - An array of the 3D Volumes that contain the segmentation data.
 * @param options.sopClassUID - Output SEG SOP Class UID. Defaults to BINARY
 *   Segmentation (`1.2.840.10008.5.1.4.1.1.66.4`) for broad PACS/viewer
 *   compatibility. Pass the Label Map Segmentation UID
 *   (`1.2.840.10008.5.1.4.1.1.66.7`, added to DICOM in 2024) to opt into that
 *   newer class — note many receivers still reject it. (OHIF selects this via the
 *   `segmentation.store.defaultMode` datasource customization.)
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

  const segmentation = _createMultiframeSegmentationFromReferencedImages(
    filteredImages,
    metadata,
    options
  );
  const segmentationResult = fillLabelmapSegmentation(
    segmentation,
    labelmaps,
    metadata,
    filteredImages,
    options,
    images.filter((image) => image?.imageId)
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
 * @returns The Seg derived dataSet.
 */
function _createMultiframeSegmentationFromReferencedImages(
  images,
  metadata,
  options
) {
  if (!images?.length || !images[0]?.imageId) {
    throw new Error(
      'Cannot create SEG derivation: no referenced source images were resolved.'
    );
  }

  const studyImageId = options?.predecessorImageId || images[0].imageId;
  const studyData = metadata.get(MetadataModules.STUDY_DATA, studyImageId);
  const datasets = images.map((image) => {
    const { imageId } = image;
    const seriesData = metadata.get(MetadataModules.SERIES_DATA, imageId);
    const imageData = metadata.get(MetadataModules.IMAGE_DATA, imageId);
    return {
      ...studyData,
      ...seriesData,
      ...imageData,
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
