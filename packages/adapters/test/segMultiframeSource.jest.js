import { describe, it, expect } from '@jest/globals';

const {
  generateSegmentation,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateSegmentation');

/**
 * Regression for storing a LABELMAP SEG whose referenced SOURCE series is a
 * multiframe (enhanced) instance.
 *
 * `_createMultiframeSegmentationFromReferencedImages` builds one virtual
 * per-frame dataset per referenced image by spreading the source instance's
 * ImageData module. For a multiframe source that module carries the source's
 * `NumberOfFrames > 1` (but none of its functional-group sequences), so the
 * `isSingleNonMultiFrame` guard (`datasets.length === 1 && !(NumberOfFrames > 1)`)
 * used to skip the duplicate-frame workaround. dcmjs' SEGImageNormalizer then
 * took the "already a multiframe" path for the single virtual dataset, ran
 * `normalizeMultiframe` on it, and threw
 * `Cannot set properties of undefined (setting 'PixelValueTransformationSequence')`
 * because the virtual dataset never got a SharedFunctionalGroupsSequence.
 *
 * The virtual dataset stands for exactly one frame, so its NumberOfFrames must
 * be 1; once it is, a multiframe source is normalized on the same virtual
 * multiframe assembly path a single-frame source stack already uses.
 */

const ENHANCED_CT_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.2.1';
const CT_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.2';
const LABELMAP_SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.7';

const STUDY_INSTANCE_UID = '1.2.826.0.1.3680043.8.498.1';
const SERIES_INSTANCE_UID = '1.2.826.0.1.3680043.8.498.2';
const FRAME_OF_REFERENCE_UID = '1.2.826.0.1.3680043.8.498.3';
const MULTIFRAME_SOP_INSTANCE_UID = '1.2.826.0.1.3680043.8.498.100.1';

const ROWS = 2;
const COLUMNS = 2;
const PIXELS_PER_SLICE = ROWS * COLUMNS;
const FRAME_COUNT = 4;

/**
 * A referenced series that is a single enhanced (multiframe) instance: every
 * frame imageId resolves to the SAME SOP Instance, whose ImageData reports
 * `NumberOfFrames > 1` and an enhanced (multiframe) SOP Class UID, and carries
 * NO SharedFunctionalGroupsSequence -- exactly the shape the source metadata
 * provider hands us for an enhanced acquisition.
 *
 * `sopClassUID` lets the same fixture stand in for a single-frame source stack
 * (a distinct instance and no NumberOfFrames per frame) to prove the
 * single-frame path is unchanged.
 */
function makeReferencedSource({ multiframe }) {
  const imageIds = [];
  const images = [];

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const imageId = multiframe
      ? `mf:${MULTIFRAME_SOP_INSTANCE_UID}/frames/${frame + 1}`
      : `ctstack:slice-${frame}`;
    imageIds.push(imageId);
    images.push({
      imageId,
      voxelManager: {
        getScalarData: () => new Uint16Array(PIXELS_PER_SLICE),
      },
    });
  }

  const sopInstanceUidForFrame = (frame) =>
    multiframe
      ? MULTIFRAME_SOP_INSTANCE_UID
      : `1.2.826.0.1.3680043.8.498.100.${frame + 2}`;

  const imageDataForFrame = (frame) => {
    const instance = {
      SOPClassUID: multiframe ? ENHANCED_CT_SOP_CLASS_UID : CT_SOP_CLASS_UID,
      SOPInstanceUID: sopInstanceUidForFrame(frame),
      InstanceNumber: String(frame + 1),
      FrameOfReferenceUID: FRAME_OF_REFERENCE_UID,
      Modality: 'CT',
      Rows: ROWS,
      Columns: COLUMNS,
      ImagePositionPatient: [0, 0, frame],
      ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
      PixelSpacing: [1, 1],
      SliceThickness: 1,
      SamplesPerPixel: 1,
      PhotometricInterpretation: 'MONOCHROME2',
      BitsAllocated: 16,
      BitsStored: 16,
      HighBit: 15,
      PixelRepresentation: 0,
    };
    // The defining trait of a multiframe source: the leaked frame count with
    // no functional groups to back it up.
    if (multiframe) {
      instance.NumberOfFrames = FRAME_COUNT;
    }
    return instance;
  };

  const metadataProvider = {
    get(moduleType, imageId) {
      const frame = imageIds.indexOf(imageId);
      if (frame === -1) {
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
          return imageDataForFrame(frame);
        case 'imagePlaneModule':
          return {
            imagePositionPatient: [0, 0, frame],
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
        default:
          return undefined;
      }
    },
  };

  return { imageIds, images, metadataProvider };
}

/** A labelmap3D carrying one segment on a single frame of the source. */
function buildSingleFrameLabelmap3D(frameIndex) {
  const labelmaps2D = new Array(FRAME_COUNT);
  labelmaps2D[frameIndex] = {
    // prettier-ignore
    pixelData: Uint8Array.from([
            1, 0,
            0, 0
        ]),
    rows: ROWS,
    columns: COLUMNS,
    segmentsOnLabelmap: [1],
  };
  return {
    segmentsOnLabelmap: [1],
    metadata: [
      null,
      {
        SegmentNumber: '1',
        SegmentLabel: 'Segment 1',
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
      },
    ],
    labelmaps2D,
  };
}

describe('generateSegmentation on a multiframe (enhanced) source', () => {
  it('stores a LABELMAP SEG drawn on a single frame of a multiframe source', () => {
    const { images, metadataProvider } = makeReferencedSource({
      multiframe: true,
    });
    // Segment on exactly one frame -> one referenced virtual dataset, the
    // case the old isSingleNonMultiFrame guard failed to normalize.
    const labelmap3D = buildSingleFrameLabelmap3D(2);

    const generated = generateSegmentation(
      images,
      labelmap3D,
      metadataProvider,
      { sopClassUID: LABELMAP_SEG_SOP_CLASS_UID }
    );

    const { dataset } = generated;
    expect(dataset.SOPClassUID).toBe(LABELMAP_SEG_SOP_CLASS_UID);
    expect(dataset.SegmentationType).toBe('LABELMAP');
    expect(Number(dataset.NumberOfFrames)).toBe(1);
    expect(dataset.PerFrameFunctionalGroupsSequence).toHaveLength(1);
    // The one written frame references the enhanced source instance.
    const perFrame = dataset.PerFrameFunctionalGroupsSequence[0];
    const source =
      perFrame?.DerivationImageSequence?.SourceImageSequence ??
      perFrame?.DerivationImageSequence?.[0]?.SourceImageSequence;
    const sourceItem = Array.isArray(source) ? source[0] : source;
    expect(sourceItem?.ReferencedSOPInstanceUID).toBe(
      MULTIFRAME_SOP_INSTANCE_UID
    );
  });

  it('leaves single-frame-source LABELMAP export unchanged', () => {
    const { images, metadataProvider } = makeReferencedSource({
      multiframe: false,
    });
    const labelmap3D = buildSingleFrameLabelmap3D(2);

    const generated = generateSegmentation(
      images,
      labelmap3D,
      metadataProvider,
      { sopClassUID: LABELMAP_SEG_SOP_CLASS_UID }
    );

    const { dataset } = generated;
    expect(dataset.SOPClassUID).toBe(LABELMAP_SEG_SOP_CLASS_UID);
    expect(dataset.SegmentationType).toBe('LABELMAP');
    expect(Number(dataset.NumberOfFrames)).toBe(1);
    expect(dataset.PerFrameFunctionalGroupsSequence).toHaveLength(1);
  });
});
