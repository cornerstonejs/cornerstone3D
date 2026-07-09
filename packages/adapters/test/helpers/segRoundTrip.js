/**
 * Shared fixtures for the real-derivation SEG round-trip tests (plan items
 * 6a/6b): a synthetic referenced CT stack (images + metadata provider), a
 * labelmap3D builder matching the shape produced by the export examples, and a
 * Part 10 writer for the dataset returned by generateSegmentation.
 *
 * Not a test file — jest only collects test/**\/*.jest.js.
 */
const { data: dcmjsData } = require('dcmjs');

const { DicomMetaDictionary, DicomDict } = dcmjsData;

const CT_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.2';
const LABELMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.7';
const BINARY_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.4';
const RLE_LOSSLESS_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.5';

const STUDY_INSTANCE_UID = '1.2.826.0.1.3680043.8.498.1';
const SERIES_INSTANCE_UID = '1.2.826.0.1.3680043.8.498.2';
const FRAME_OF_REFERENCE_UID = '1.2.826.0.1.3680043.8.498.3';

const ROWS = 4;
const COLUMNS = 4;
const PIXELS_PER_SLICE = ROWS * COLUMNS;

function sopInstanceUidForSlice(sliceIndex) {
  return `1.2.826.0.1.3680043.8.498.100.${sliceIndex + 1}`;
}

function imageIdForSlice(sliceIndex) {
  // No "/frames/" or "frame=" patterns so nothing parses a frame number
  // out of these single-frame ids.
  return `ctstack:slice-${sliceIndex}`;
}

/**
 * A stack of single-frame CT images: cornerstone-like image objects (imageId +
 * voxelManager) for the export side and a metadata provider answering every
 * module both the export and the load side consult.
 *
 * `zDirection` sets slice position to `[0, 0, zDirection * sliceIndex]`.
 * dcmjs' ImageNormalizer sorts the virtual multiframe's frames by DESCENDING
 * distance along the scan axis, and the BINARY export path assumes
 * `images[i]` corresponds to normalized frame `i` when it copies each frame's
 * PlanePositionSequence out of the referenced multiframe. That assumption only
 * holds when the input stack is already ordered descending along the normal —
 * pass `zDirection: -1` for the self-consistent case. (The LABELMAP path
 * rebuilds plane sequences from each image's own imagePlaneModule, so it is
 * order-independent.)
 */
function makeReferencedStack(sliceCount, options = {}) {
  const { zDirection = 1 } = options;
  const imageIds = [];
  const images = [];

  for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
    const imageId = imageIdForSlice(sliceIndex);
    imageIds.push(imageId);
    images.push({
      imageId,
      voxelManager: {
        getScalarData: () => new Uint16Array(PIXELS_PER_SLICE),
      },
    });
  }

  const zForSlice = (sliceIndex) => zDirection * sliceIndex;

  const instanceForSlice = (sliceIndex) => ({
    SOPClassUID: CT_SOP_CLASS_UID,
    SOPInstanceUID: sopInstanceUidForSlice(sliceIndex),
    InstanceNumber: String(sliceIndex + 1),
    FrameOfReferenceUID: FRAME_OF_REFERENCE_UID,
    Modality: 'CT',
    Rows: ROWS,
    Columns: COLUMNS,
    ImagePositionPatient: [0, 0, zForSlice(sliceIndex)],
    ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
    PixelSpacing: [1, 1],
    SliceThickness: 1,
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    BitsAllocated: 16,
    BitsStored: 16,
    HighBit: 15,
    PixelRepresentation: 0,
  });

  const metadataProvider = {
    get(moduleType, imageId) {
      const sliceIndex = imageIds.indexOf(imageId);
      if (sliceIndex === -1) {
        return undefined;
      }

      switch (moduleType) {
        case 'StudyData':
          return {
            StudyInstanceUID: STUDY_INSTANCE_UID,
            StudyDate: '20260101',
            StudyTime: '000000',
            StudyID: '1',
            AccessionNumber: '1',
            PatientName: 'Test^Patient',
            PatientID: 'TEST',
            PatientBirthDate: '',
            PatientSex: 'O',
            ReferringPhysicianName: '',
          };
        case 'SeriesData':
          return {
            StudyInstanceUID: STUDY_INSTANCE_UID,
            SeriesInstanceUID: SERIES_INSTANCE_UID,
            Modality: 'CT',
            SeriesNumber: '1',
            SeriesDate: '20260101',
            SeriesTime: '000000',
          };
        case 'ImageData':
        case 'instance':
          return instanceForSlice(sliceIndex);
        case 'imagePlaneModule':
          return {
            imagePositionPatient: [0, 0, zForSlice(sliceIndex)],
            imageOrientationPatient: [1, 0, 0, 0, 1, 0],
            rowCosines: [1, 0, 0],
            columnCosines: [0, 1, 0],
            rowPixelSpacing: 1,
            columnPixelSpacing: 1,
            sliceThickness: 1,
            rows: ROWS,
            columns: COLUMNS,
            frameOfReferenceUID: FRAME_OF_REFERENCE_UID,
          };
        case 'generalSeriesModule':
          return {
            seriesInstanceUID: SERIES_INSTANCE_UID,
            studyInstanceUID: STUDY_INSTANCE_UID,
            modality: 'CT',
          };
        case 'generalImageModule':
          return {
            sopInstanceUID: sopInstanceUidForSlice(sliceIndex),
          };
        default:
          return undefined;
      }
    },
  };

  return { imageIds, images, metadataProvider };
}

/**
 * Builds a labelmap3D in the shape the export examples produce, from a map of
 * sliceIndex -> flat pixel values (length ROWS * COLUMNS).
 */
function buildLabelmap3D(sliceCount, pixelValuesBySlice, options = {}) {
  const { SegmentArray = Uint8Array } = options;
  const labelmaps2D = new Array(sliceCount);
  const allSegments = new Set();

  Object.entries(pixelValuesBySlice).forEach(([sliceIndex, pixelValues]) => {
    const segmentsOnLabelmap = Array.from(
      new Set(pixelValues.filter((value) => value !== 0))
    );
    segmentsOnLabelmap.forEach((segment) => allSegments.add(segment));
    labelmaps2D[Number(sliceIndex)] = {
      pixelData: SegmentArray.from(pixelValues),
      rows: ROWS,
      columns: COLUMNS,
      segmentsOnLabelmap,
    };
  });

  const labelmap3D = {
    segmentsOnLabelmap: Array.from(allSegments),
    metadata: [],
    labelmaps2D,
  };

  allSegments.forEach((segmentIndex) => {
    labelmap3D.metadata[segmentIndex] = {
      SegmentNumber: String(segmentIndex),
      SegmentLabel: `Segment ${segmentIndex}`,
      SegmentAlgorithmType: 'MANUAL',
      SegmentAlgorithmName: 'Test',
      SegmentedPropertyCategoryCodeSequence: {
        CodeValue: 'T-D0050',
        CodingSchemeDesignator: 'SRT',
        CodeMeaning: 'Tissue',
      },
      SegmentedPropertyTypeCodeSequence: {
        CodeValue: 'T-D0050',
        CodingSchemeDesignator: 'SRT',
        CodeMeaning: 'Tissue',
      },
    };
  });

  return labelmap3D;
}

/**
 * Serializes the dataset returned by generateSegmentation to a Part 10 buffer,
 * exactly as a store/download flow would.
 */
function datasetToPart10Buffer(dataset) {
  const meta = {
    MediaStorageSOPClassUID: dataset.SOPClassUID,
    MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
    TransferSyntaxUID: dataset._meta.TransferSyntaxUID.Value[0],
    ImplementationClassUID: '1.2.3.4',
  };

  const dicomDict = new DicomDict(
    DicomMetaDictionary.denaturalizeDataset(meta)
  );
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  return dicomDict.write();
}

/** First item whether the attribute is a single item or an item array. */
function firstItem(sequence) {
  return Array.isArray(sequence) ? sequence[0] : sequence;
}

/** The frame's DerivationImageSequence source reference. */
function getFrameSourceReference(perFrameGroup) {
  const derivation = firstItem(perFrameGroup?.DerivationImageSequence);
  return firstItem(derivation?.SourceImageSequence);
}

module.exports = {
  ROWS,
  COLUMNS,
  PIXELS_PER_SLICE,
  CT_SOP_CLASS_UID,
  LABELMAP_SEG_SOP_CLASS_UID,
  BINARY_SEG_SOP_CLASS_UID,
  RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
  sopInstanceUidForSlice,
  imageIdForSlice,
  makeReferencedStack,
  buildLabelmap3D,
  datasetToPart10Buffer,
  firstItem,
  getFrameSourceReference,
};
