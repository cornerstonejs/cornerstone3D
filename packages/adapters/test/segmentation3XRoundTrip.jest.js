import { describe, it, expect } from '@jest/globals';
import { data as dcmjsData } from '@dcmjs-org/dcmjs';
import Segmentation_3X from '../src/adapters/Cornerstone/Segmentation_3X';
import {
  makeReferencedStack,
  buildLabelmap3D,
  BINARY_SEG_SOP_CLASS_UID,
} from './helpers/segRoundTrip';

const { DicomDict, DicomMessage, DicomMetaDictionary } = dcmjsData;

// prettier-ignore
const SHAPE = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
];

/** A cornerstone image whose byteArray holds a Part 10 CT instance. */
function makePart10Image(imageId, instance) {
  const dicomDict = new DicomDict(
    DicomMetaDictionary.denaturalizeDataset({
      MediaStorageSOPClassUID: instance.SOPClassUID,
      MediaStorageSOPInstanceUID: instance.SOPInstanceUID,
      TransferSyntaxUID: '1.2.840.10008.1.2.1',
      ImplementationClassUID: '1.2.3.4',
    })
  );
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset({
    ...instance,
    StudyInstanceUID: '1.2.826.0.1.3680043.8.498.1',
    PixelData: [new Uint16Array(16).buffer],
    _vrMap: { PixelData: 'OW' },
  });
  const byteArray = new Uint8Array(dicomDict.write());
  return { imageId, rows: 4, columns: 4, data: { byteArray } };
}

/** jsdom has no Blob.arrayBuffer. */
function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * The legacy cornerstoneTools brush path: generateSegmentation writes a
 * BINARY SEG, and generateToolState reads the bit-packed PixelData back.
 */
describe('Segmentation_3X', () => {
  it('writes the brush tool state as a BINARY SEG and reads it back', async () => {
    const stack = makeReferencedStack(2);
    const images = stack.imageIds.map((imageId) =>
      makePart10Image(imageId, stack.metadataProvider.get('instance', imageId))
    );
    const toolState = {
      [stack.imageIds[1]]: { brush: { data: [, { pixelData: SHAPE }] } },
    };
    const { metadata: segments } = buildLabelmap3D(2, { 1: SHAPE });

    const blob = Segmentation_3X.generateSegmentation(images, {
      toolState,
      segments,
    });
    const arrayBuffer = await readBlob(blob);

    const { dict } = DicomMessage.readFile(arrayBuffer);
    const seg = DicomMetaDictionary.naturalizeDataset(dict);
    expect(seg.SOPClassUID).toBe(BINARY_SEG_SOP_CLASS_UID);
    expect(Number(seg.NumberOfFrames)).toBe(1);

    const metadataProvider = {
      get: (moduleType, imageId) =>
        moduleType === 'sopCommonModule'
          ? {
              sopInstanceUID: stack.metadataProvider.get('instance', imageId)
                ?.SOPInstanceUID,
            }
          : stack.metadataProvider.get(moduleType, imageId),
    };
    const result = Segmentation_3X.generateToolState(
      stack.imageIds,
      arrayBuffer,
      metadataProvider
    );

    // One frame comes back, with the bit-packed PixelData unpacked.
    const brushes = Object.values(result.toolState).flatMap(({ brush }) =>
      brush.data.filter(Boolean)
    );
    expect(brushes).toHaveLength(1);
    expect(Array.from(brushes[0].pixelData)).toEqual(SHAPE);
  });
});
