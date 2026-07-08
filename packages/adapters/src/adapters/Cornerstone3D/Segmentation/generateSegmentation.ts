import { normalizers, derivations } from 'dcmjs';
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

const { MetadataModules } = Enums;
const { SEGImageNormalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;
const LABELMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.7';
const BITMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.4';

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

/**
 * Builds the per-frame PlanePositionSequence / PlaneOrientationSequence for a
 * LABELMAP SEG frame from its source image's imagePlaneModule.
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
  const imagePlane = metadata?.get?.(
    MetadataModules.IMAGE_PLANE,
    image?.imageId
  );

  if (!imagePlane) {
    return {};
  }

  const result: {
    planePositionSequence?: { ImagePositionPatient: number[] };
    planeOrientationSequence?: { ImageOrientationPatient: number[] };
  } = {};

  const {
    imagePositionPatient,
    imageOrientationPatient,
    rowCosines,
    columnCosines,
  } = imagePlane;

  if (
    Array.isArray(imagePositionPatient) &&
    imagePositionPatient.length === 3
  ) {
    result.planePositionSequence = {
      ImagePositionPatient: [...imagePositionPatient],
    };
  }

  let orientation = imageOrientationPatient;
  if (
    (!Array.isArray(orientation) || orientation.length !== 6) &&
    Array.isArray(rowCosines) &&
    Array.isArray(columnCosines)
  ) {
    orientation = [...rowCosines, ...columnCosines];
  }
  if (Array.isArray(orientation) && orientation.length === 6) {
    result.planeOrientationSequence = {
      ImageOrientationPatient: [...orientation],
    };
  }

  return result;
}

function fillLabelmapSegmentation(
  segmentation,
  inputLabelmaps3D,
  metadata,
  images,
  options: Options = {}
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

  // Overlay every labelmap3D onto each exported frame. A single-valued LABELMAP
  // cannot represent overlapping segments, so on a voxel claimed by two labelmaps
  // the later one wins (warned once).
  let overlapWarned = false;
  const framePixelData = validFrameIndices.map((frameIndex) => {
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
          console.warn(
            'generateSegmentation: overlapping labelmap segments detected on the ' +
              'same voxel while exporting a LABELMAP SEG; the later labelmap wins.'
          );
          overlapWarned = true;
        }
        frame[i] = value;
      }
    });
    return frame;
  });

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
    frames: framePixelData,
    bitsAllocated: useUint16 ? 16 : 8,
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

  applyPerFrameFunctionalGroups(dataset, perFrameInputs);

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
      Object.assign(segmentationResult, predecessor);
    }

    return segmentationResult;
  }

  // Union of non-empty frames across ALL labelmap3D inputs — the same basis
  // fillLabelmapSegmentation uses — so the referenced/derived images line up with
  // the frames actually written.
  const nonEmptyFrameIndices = collectNonEmptyFrameIndices(
    toLabelmap3DArray(labelmaps)
  );
  const filteredImages = nonEmptyFrameIndices.length
    ? nonEmptyFrameIndices.map((index) => images[index]).filter(Boolean)
    : images;

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
    options
  );

  const predecessorImageId = options?.predecessorImageId;
  if (predecessorImageId) {
    const predecessor = metadata.get(
      MetadataModules.PREDECESSOR_SEQUENCE,
      predecessorImageId
    );
    Object.assign(segmentationResult, predecessor);
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
  maxSegmentValue,
  collectSegmentSequence,
};
