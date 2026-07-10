import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import { data as dcmjsData } from 'dcmjs';

// Only the derived-labelmap image factory needs stubbing — the referenced
// images are not really loaded in this unit test. Everything else (decode,
// orientation, insert, centroid) runs for real.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        const pixelData = new Uint8Array(4);
        return {
          referencedImageId,
          getPixelData: () => pixelData,
          voxelManager: {
            setAtIndex: (index, value) => (pixelData[index] = value),
          },
        };
      },
    },
  };
});

// Imported after jest.mock so the mocked core is wired in.
const {
  createFromDICOMSegBuffer,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateToolState');

const SEG_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.66.4';
const CT_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.2';
const EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';

const REFERENCED_SOP_INSTANCE_UID = '1.2.3.4.5.100';
const REFERENCED_IMAGE_ID = 'ref:0';
const SEG_SERIES_INSTANCE_UID = '1.2.3.4.2';

/**
 * Builds a real Part-10 DICOM SEG ArrayBuffer: a single 2x2 binary frame with
 * segment 1 set at the top-left and bottom-right pixels, referencing one CT
 * instance. Written and read back through dcmjs so it exercises the genuine
 * parse path inside createFromDICOMSegBuffer.
 */
function buildSegPart10Buffer() {
  const { DicomMetaDictionary, DicomDict } = dcmjsData;

  const frame = new Uint8Array([1, 0, 0, 1]);

  const dataset = {
    SOPClassUID: SEG_SOP_CLASS,
    SOPInstanceUID: '1.2.3.4.5.999',
    StudyInstanceUID: '1.2.3.4.1',
    SeriesInstanceUID: SEG_SERIES_INSTANCE_UID,
    Modality: 'SEG',
    Rows: 2,
    Columns: 2,
    NumberOfFrames: 1,
    BitsAllocated: 8,
    BitsStored: 8,
    HighBit: 7,
    PixelRepresentation: 0,
    SamplesPerPixel: 1,
    SegmentationType: 'BINARY',
    PhotometricInterpretation: 'MONOCHROME2',
    ContentLabel: 'SEG',
    SegmentSequence: [
      {
        SegmentNumber: 1,
        SegmentLabel: 'seg1',
        SegmentAlgorithmType: 'MANUAL',
        SegmentedPropertyCategoryCodeSequence: [
          {
            CodeValue: 'T-D0050',
            CodingSchemeDesignator: 'SRT',
            CodeMeaning: 'Tissue',
          },
        ],
        SegmentedPropertyTypeCodeSequence: [
          {
            CodeValue: 'T-D0050',
            CodingSchemeDesignator: 'SRT',
            CodeMeaning: 'Tissue',
          },
        ],
      },
    ],
    SharedFunctionalGroupsSequence: [
      {
        PlaneOrientationSequence: [
          { ImageOrientationPatient: [1, 0, 0, 0, 1, 0] },
        ],
        PixelMeasuresSequence: [{ PixelSpacing: [1, 1], SliceThickness: 1 }],
      },
    ],
    PerFrameFunctionalGroupsSequence: [
      {
        FrameContentSequence: [{ DimensionIndexValues: [1, 1] }],
        PlanePositionSequence: [{ ImagePositionPatient: [0, 0, 0] }],
        SegmentIdentificationSequence: [{ ReferencedSegmentNumber: 1 }],
        DerivationImageSequence: [
          {
            SourceImageSequence: [
              {
                ReferencedSOPClassUID: CT_SOP_CLASS,
                ReferencedSOPInstanceUID: REFERENCED_SOP_INSTANCE_UID,
              },
            ],
          },
        ],
      },
    ],
    PixelData: [frame.buffer],
    // PixelData VR is ambiguous (OB/OW) for this synthetic dataset; pin it so
    // dcmjs does not log a write-time warning.
    _vrMap: { PixelData: 'OW' },
  };

  const meta = {
    MediaStorageSOPClassUID: SEG_SOP_CLASS,
    MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
    TransferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN,
    ImplementationClassUID: '1.2.3.4',
  };

  const dicomDict = new DicomDict(
    DicomMetaDictionary.denaturalizeDataset(meta)
  );
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  return dicomDict.write();
}

/**
 * Mimics OHIF's MetadataProvider: `get('instance', imageId)` resolves the real
 * DICOM instance and returns *before* it ever consults custom metadata. So a
 * synthetic SEG imageId (the one the buffer path registers) is never
 * retrievable as an 'instance', which is exactly what broke the buffer path.
 * Here it returns undefined for the SEG instance but answers the referenced CT.
 */
function makeOhifLikeProvider() {
  const get = jest.fn((type, imageId) => {
    if (imageId !== REFERENCED_IMAGE_ID) {
      // Notably: get('instance', '<synthetic seg id>') => undefined.
      return undefined;
    }
    switch (type) {
      case 'imagePlaneModule':
        return {
          rowCosines: [1, 0, 0],
          columnCosines: [0, 1, 0],
          imagePositionPatient: [0, 0, 0],
          rowPixelSpacing: 1,
          columnPixelSpacing: 1,
          rows: 2,
          columns: 2,
        };
      case 'generalSeriesModule':
        return { seriesInstanceUID: SEG_SERIES_INSTANCE_UID };
      case 'generalImageModule':
        return { sopInstanceUID: REFERENCED_SOP_INSTANCE_UID };
      case 'instance':
        return {
          Rows: 2,
          Columns: 2,
          SOPInstanceUID: REFERENCED_SOP_INSTANCE_UID,
        };
      default:
        return undefined;
    }
  });
  return get;
}

describe('createFromDICOMSegBuffer (legacy buffer API)', () => {
  let arrayBuffer;

  beforeAll(() => {
    arrayBuffer = buildSegPart10Buffer();
  });

  it('decodes a Part-10 SEG buffer without resolving the SEG instance through the provider', async () => {
    const get = makeOhifLikeProvider();
    const metadataProvider = { get };

    // Regression: the buffer path used to re-fetch the parsed SEG via
    // get('instance', '<synthetic seg id>'), which an OHIF-like provider
    // returns undefined for -> "No instance metadata found". With the dataset
    // threaded through, the call completes against the same provider.
    const result = await createFromDICOMSegBuffer(
      [REFERENCED_IMAGE_ID],
      arrayBuffer,
      {
        metadataProvider,
      }
    );

    // It produced a labelmap with segment 1 written at the expected pixels.
    const labelMapImages = result.labelMapImages.flat();
    expect(labelMapImages).toHaveLength(1);
    expect(Array.from(labelMapImages[0].getPixelData())).toEqual([1, 0, 0, 1]);
    expect(result.segMetadata.data[1].SegmentLabel).toBe('seg1');

    // The provider WAS asked for the synthetic SEG instance and every such
    // lookup returned undefined — yet the call still succeeded, proving the
    // parsed dataset was used directly rather than round-tripped back out of
    // the provider (the original regression).
    const segInstanceResults = get.mock.results.filter((_, i) => {
      const [type, imageId] = get.mock.calls[i];
      return type === 'instance' && imageId !== REFERENCED_IMAGE_ID;
    });
    expect(segInstanceResults.length).toBeGreaterThan(0);
    segInstanceResults.forEach((r) => expect(r.value).toBeUndefined());
  });
});
