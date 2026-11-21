import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import dcmjs from 'dcmjs';
import { metaData } from '@cornerstonejs/core';
import { Cornerstone3DSR } from '../src/adapters/Cornerstone3D';

const { KeyImage, Probe, MeasurementReport } = Cornerstone3DSR;
const { DicomMessage, DicomMetaDictionary } = dcmjs.data;

const IMAGE_ID = 'wadors:/studies/1/series/2/instances/3/frames/1';
const SOP_INSTANCE_UID = '1.2.826.0.1.3680043.8.498.3';
const FRAME_OF_REFERENCE_UID = '1.2.826.0.1.3680043.8.498.4';

// A real patient position and a non-unit spacing, so the image <-> world
// conversion of the point is exercised.
const imagePlaneModule = {
  frameOfReferenceUID: FRAME_OF_REFERENCE_UID,
  rows: 256,
  columns: 256,
  imagePositionPatient: [-125.3, -98.7, 42.5],
  rowCosines: [1, 0, 0],
  columnCosines: [0, 1, 0],
  rowPixelSpacing: 0.7,
  columnPixelSpacing: 0.7,
};

const provider = (type, imageId) => {
  if (imageId !== IMAGE_ID) {
    return;
  }
  if (type === 'imagePlaneModule') {
    return imagePlaneModule;
  }
  if (type === 'sopCommonModule') {
    return {
      sopInstanceUID: SOP_INSTANCE_UID,
      sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
    };
  }
  if (type === 'instance') {
    return {
      StudyInstanceUID: '1.2.826.0.1.3680043.8.498.1',
      SeriesInstanceUID: '1.2.826.0.1.3680043.8.498.2',
      SOPInstanceUID: SOP_INSTANCE_UID,
    };
  }
};

const metadata = { get: provider };

// The point lies at image coordinates [10, 20].
const worldPoint = [-125.3 + 10 * 0.7, -98.7 + 20 * 0.7, 42.5];

function keyImageAnnotation(data) {
  return {
    annotationUID: 'key-image',
    metadata: {
      toolName: KeyImage.toolType,
      referencedImageId: IMAGE_ID,
      FrameOfReferenceUID: FRAME_OF_REFERENCE_UID,
    },
    data: {
      handles: { points: [worldPoint] },
      ...data,
    },
  };
}

/** Writes the annotation to an SR, through Part 10 bytes, and reads it back. */
function roundTrip(annotation) {
  const toolState = {
    [IMAGE_ID]: { [KeyImage.toolType]: { data: [annotation] } },
  };
  const report = MeasurementReport.generateReport(toolState, metadata, {});
  const { dataset } = report;
  const meta = {
    MediaStorageSOPClassUID: dataset.SOPClassUID,
    MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
    TransferSyntaxUID: '1.2.840.10008.1.2.1',
    ImplementationClassUID: '1.2.3.4',
  };
  const dicomDict = new dcmjs.data.DicomDict(
    DicomMetaDictionary.denaturalizeDataset(meta)
  );
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  const read = DicomMessage.readFile(dicomDict.write());
  const naturalized = DicomMetaDictionary.naturalizeDataset(read.dict);

  return MeasurementReport.generateToolState(
    naturalized,
    { [`${SOP_INSTANCE_UID}:1`]: IMAGE_ID },
    metadata
  );
}

describe('KeyImage', () => {
  beforeAll(() => {
    metaData.addProvider(provider, 10000);
  });

  afterAll(() => {
    metaData.removeProvider(provider);
  });

  it('Must define tool type', () => {
    expect(KeyImage.toolType).toBe('KeyImage');
    // Even after registering a sub-type of Probe, the Probe type should be correct
    expect(Probe.toolType).toBe('Probe');
  });

  it('Must define tracking identifiers', () => {
    expect(KeyImage.trackingIdentifierTextValue).toBe(
      'Cornerstone3DTools@^0.1.0:Probe:KeyImage'
    );
    // Even after registering a sub-type of Probe, the Probe tracking identifier should be unchanged
    expect(Probe.trackingIdentifierTextValue).toBe(
      'Cornerstone3DTools@^0.1.0:Probe'
    );
  });

  it.each([
    'Cornerstone3DTools@^0.1.0:Probe:KeyImage',
    'Cornerstone3DTools@^0.1.0:Probe:KeyImage:Point',
    'Cornerstone3DTools@^0.1.0:Probe:KeyImage:Series',
    'Cornerstone3DTools@^0.1.0:Probe:KeyImage:SeriesPoint',
  ])('reads %s with the KeyImage adapter', (trackingIdentifier) => {
    expect(
      MeasurementReport.getAdapterForTrackingIdentifier(trackingIdentifier)
    ).toBe(KeyImage);
  });

  it('still reads a plain Probe and an unregistered Probe suffix as Probe', () => {
    expect(
      MeasurementReport.getAdapterForTrackingIdentifier(
        'Cornerstone3DTools@^0.1.0:Probe'
      )
    ).toBe(Probe);
    expect(
      MeasurementReport.getAdapterForTrackingIdentifier(
        'Cornerstone3DTools@^0.1.0:Probe:Custom'
      )
    ).toBe(Probe);
    // Legacy identifiers keep resolving to their adapter
    expect(
      MeasurementReport.getAdapterForTrackingIdentifier(
        'cornerstoneTools@^4.0.0:Probe'
      )
    ).toBe(Probe);
  });

  it('writes a series level point key image as SeriesPoint', () => {
    const args = KeyImage.getTID300RepresentationArguments(
      keyImageAnnotation({ isPoint: true, seriesLevel: true })
    );
    expect(args.trackingIdentifierTextValue).toBe(
      KeyImage.trackingSeriesPointIdentifier
    );
  });

  describe('SR round trip', () => {
    it.each([
      [{ isPoint: false, seriesLevel: false }],
      [{ isPoint: true, seriesLevel: false }],
      [{ isPoint: false, seriesLevel: true }],
      [{ isPoint: true, seriesLevel: true }],
    ])('restores a KeyImage annotation with %o', (flags) => {
      const toolState = roundTrip(keyImageAnnotation(flags));

      expect(toolState.Probe).toBeUndefined();
      expect(toolState.KeyImage).toHaveLength(1);
      const [{ annotation }] = toolState.KeyImage;
      expect(annotation.metadata.toolName).toBe('KeyImage');
      expect(annotation.metadata.referencedImageId).toBe(IMAGE_ID);
      expect(annotation.data.isPoint).toBe(flags.isPoint);
      expect(annotation.data.seriesLevel).toBe(flags.seriesLevel);
      const [point] = annotation.data.handles.points;
      worldPoint.forEach((value, index) =>
        expect(point[index]).toBeCloseTo(value, 4)
      );
    });
  });
});
