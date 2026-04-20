import { normalizers, derivations, data as dcmjsData } from 'dcmjs';
import { Enums } from '@cornerstonejs/core';
import { fillSegmentation as fillBitmapSegmentation } from '../../Cornerstone/Segmentation_4X';
import {
  encodeFramesToTransferSyntax,
  EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
  RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
} from '../encodePixelData';

const { MetadataModules } = Enums;
const { SEGImageNormalizer } = normalizers;
const { Segmentation: SegmentationDerivation } = derivations;
const { BitArray } = dcmjsData;
const LABELMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.7';
const BITMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.4';

interface IOptions {
  predecessorImageId?: string;
}

type Options = IOptions & {
  [key: string]: number | boolean | unknown | string;
};

function resolveTransferSyntaxUid(options: Options = {}) {
  return (
    (options.transferSyntaxUid as string) ||
    (options.transferSyntaxUID as string) ||
    RLE_LOSSLESS_TRANSFER_SYNTAX_UID
  );
}

function getFrameArrayFromBitmapDataset(dataset) {
  const numberOfFrames = Number(dataset.NumberOfFrames) || 1;
  const rows = Number(dataset.Rows);
  const columns = Number(dataset.Columns);
  const samplesPerFrame = rows * columns;
  const bitsAllocated = Number(dataset.BitsAllocated);
  const pixelData = dataset.PixelData;

  if (!pixelData) {
    throw new Error('Bitmap SEG dataset has no PixelData');
  }

  if (bitsAllocated === 1) {
    const packed =
      pixelData instanceof Uint8Array ? pixelData : new Uint8Array(pixelData);
    const unpacked = BitArray.unpack(packed);
    const frames: Uint8Array[] = [];

    for (let i = 0; i < numberOfFrames; i++) {
      const start = i * samplesPerFrame;
      frames.push(unpacked.slice(start, start + samplesPerFrame));
    }

    return { frames, bitsAllocated };
  }

  if (bitsAllocated <= 8) {
    const buffer =
      pixelData instanceof Uint8Array ? pixelData : new Uint8Array(pixelData);
    const frames: Uint8Array[] = [];
    for (let i = 0; i < numberOfFrames; i++) {
      const start = i * samplesPerFrame;
      frames.push(buffer.slice(start, start + samplesPerFrame));
    }
    return { frames, bitsAllocated };
  }

  const buffer =
    pixelData instanceof Uint16Array ? pixelData : new Uint16Array(pixelData);
  const frames: Uint16Array[] = [];
  for (let i = 0; i < numberOfFrames; i++) {
    const start = i * samplesPerFrame;
    frames.push(buffer.slice(start, start + samplesPerFrame));
  }
  return { frames, bitsAllocated };
}

function hasAnySegment(pixelData: ArrayLike<number>) {
  for (let i = 0; i < pixelData.length; i++) {
    if (pixelData[i] !== 0) {
      return true;
    }
  }

  return false;
}

function normalizeFramePixelData(pixelData: ArrayLike<number>) {
  if (pixelData instanceof Uint8Array) {
    return pixelData;
  }

  const frame = new Uint8Array(pixelData.length);
  for (let i = 0; i < pixelData.length; i++) {
    frame[i] = pixelData[i];
  }

  return frame;
}

function getReferencedSourceImageSequenceItem(image, metadata) {
  const imageData =
    metadata.get(MetadataModules.IMAGE_DATA, image?.imageId) || {};
  const referencedSOPInstanceUID = imageData.SOPInstanceUID;

  const frameMatch = image?.imageId?.match?.(/[?&]frame=(\d+)/);
  const referencedFrameNumber = frameMatch ? Number(frameMatch[1]) : undefined;
  const item: {
    ReferencedSOPInstanceUID: string;
    ReferencedFrameNumber?: number;
  } = {
    ReferencedSOPInstanceUID: referencedSOPInstanceUID,
  };

  if (Number.isFinite(referencedFrameNumber) && referencedFrameNumber > 0) {
    item.ReferencedFrameNumber = referencedFrameNumber;
  }

  return item;
}

function fillLabelmapSegmentation(
  segmentation,
  inputLabelmaps3D,
  metadata,
  images,
  options: Options = {}
) {
  const labelmap3D = Array.isArray(inputLabelmaps3D)
    ? inputLabelmaps3D[0]
    : inputLabelmaps3D;
  const labelmaps2D = labelmap3D?.labelmaps2D ?? [];
  const segmentSequence =
    labelmap3D?.metadata?.filter(Boolean)?.map((segment) => ({ ...segment })) ??
    [];
  const validFrameIndices: number[] = [];

  for (let i = 0; i < labelmaps2D.length; i++) {
    const labelmap2D = labelmaps2D[i];

    if (!labelmap2D?.pixelData) {
      continue;
    }

    if (!hasAnySegment(labelmap2D.pixelData)) {
      continue;
    }

    validFrameIndices.push(i);
  }

  if (!validFrameIndices.length) {
    throw new Error('No non-empty labelmap frames found for SEG export');
  }

  const firstFrame = labelmaps2D[validFrameIndices[0]];
  const rows = firstFrame.rows;
  const columns = firstFrame.columns;
  const frameLength = rows * columns;
  const numberOfFrames = validFrameIndices.length;

  const combinedPixelData = new Uint8Array(frameLength * numberOfFrames);
  const framePixelData: Uint8Array[] = [];
  validFrameIndices.forEach((frameIndex, outputIndex) => {
    const source = normalizeFramePixelData(labelmaps2D[frameIndex].pixelData);
    combinedPixelData.set(source, outputIndex * frameLength);
    framePixelData.push(source);
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
  dataset.BitsAllocated = '8';
  dataset.BitsStored = '8';
  dataset.HighBit = '7';
  dataset.PixelRepresentation = '0';
  delete dataset.MaximumFractionalValue;
  delete dataset.SegmentationFractionalType;
  dataset.SpecificCharacterSet = 'ISO_IR 192';
  dataset._vrMap ||= {};

  const transferSyntaxUid = resolveTransferSyntaxUid(options);
  const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
    transferSyntaxUID: transferSyntaxUid,
    frames: framePixelData,
    bitsAllocated: 8,
  });
  dataset.PixelData = pixelData;
  dataset._vrMap.PixelData = pixelDataVR;
  dataset._meta ||= {};
  dataset._meta.TransferSyntaxUID = {
    Value: [transferSyntaxUid],
    vr: 'UI',
  };

  dataset._meta ||= {};
  dataset._meta.MediaStorageSOPClassUID = {
    Value: [LABELMAP_SEG_SOP_CLASS_UID],
    vr: 'UI',
  };

  // Keep normalizer-generated per-frame items for the filtered input images.
  dataset.PerFrameFunctionalGroupsSequence = (
    dataset.PerFrameFunctionalGroupsSequence ?? []
  ).filter(Boolean);

  const sourceImageSequence = images
    .map((image) => getReferencedSourceImageSequenceItem(image, metadata))
    .filter((item) => item.ReferencedSOPInstanceUID);

  if (sourceImageSequence.length) {
    dataset.SourceImageSequence = sourceImageSequence;
    dataset.PerFrameFunctionalGroupsSequence =
      dataset.PerFrameFunctionalGroupsSequence.map((group, index) => {
        const sourceImageSequenceItem = sourceImageSequence[index];
        if (!sourceImageSequenceItem) {
          return group;
        }

        return {
          ...group,
          DerivationImageSequence: {
            SourceImageSequence: [sourceImageSequenceItem],
          },
        };
      });
  }

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
 */
function generateSegmentation(
  images,
  labelmaps,
  metadata,
  options: Options = {}
) {
  const requestedSOPClassUID =
    (options?.sopClassUID as string) || LABELMAP_SEG_SOP_CLASS_UID;
  const shouldExportBitmap = requestedSOPClassUID === BITMAP_SEG_SOP_CLASS_UID;

  if (shouldExportBitmap) {
    const transferSyntaxUid = resolveTransferSyntaxUid(options);
    const segmentation = _createMultiframeSegmentationFromReferencedImages(
      images,
      metadata,
      options
    );
    const segmentationResult = fillBitmapSegmentation(segmentation, labelmaps, {
      ...options,
      transferSyntaxUid: EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
    });
    const { frames, bitsAllocated } = getFrameArrayFromBitmapDataset(
      segmentationResult.dataset
    );
    const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
      transferSyntaxUID: transferSyntaxUid,
      frames,
      bitsAllocated,
    });

    segmentationResult.dataset.PixelData = pixelData;
    segmentationResult.dataset._vrMap ||= {};
    segmentationResult.dataset._vrMap.PixelData = pixelDataVR;
    segmentationResult.dataset.SOPClassUID = BITMAP_SEG_SOP_CLASS_UID;
    segmentationResult.dataset._meta ||= {};
    segmentationResult.dataset._meta.TransferSyntaxUID = {
      Value: [transferSyntaxUid],
      vr: 'UI',
    };
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

  const labelmap3D = Array.isArray(labelmaps) ? labelmaps[0] : labelmaps;
  const nonEmptyFrameIndices =
    labelmap3D?.labelmaps2D
      ?.map((frame, index) =>
        frame?.pixelData && hasAnySegment(frame.pixelData) ? index : -1
      )
      .filter((index) => index >= 0) ?? [];
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

  multiframe.SharedFunctionalGroupsSequence ||= {};
  multiframe.SharedFunctionalGroupsSequence.PixelMeasuresSequence = {};
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

export { generateSegmentation };
