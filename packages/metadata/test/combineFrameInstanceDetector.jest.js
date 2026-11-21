/**
 * NM multi-frame instances can carry the frame geometry in the Detector
 * Information Sequence (0054,0022) instead of at the root. That sequence is
 * Type 2, so it can be present with zero items. The detector item's
 * ImagePositionPatient and ImageOrientationPatient are Type 2, so they can be
 * empty, and a non-conformant file may leave one out entirely.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import dcmjs from 'dcmjs';
import { getMetaData, removeAllProviders } from '../src/metaData';
import { registerDefaultProviders } from '../src/registerDefaultProviders';
import {
  setCacheData,
  clearCacheData,
} from '../src/utilities/metadataProvider/cacheData';
import { naturalizePart10Buffer } from '../src/utilities/metadataProvider/naturalizedHandlers';
import { combineFrameInstance } from '../src/utilities/metadataProvider/combineFrameInstance';
import { MetadataModules } from '../src/enums';

const BASE_IMAGE_ID = 'wadouri:https://example.com/nm.dcm';

function writePart10(dataset) {
  const dicomDict = new dcmjs.data.DicomDict({
    '00020002': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.20'] },
    '00020003': { vr: 'UI', Value: ['1.2.3.4'] },
    '00020010': { vr: 'UI', Value: ['1.2.840.10008.1.2.1'] },
  });
  dicomDict.dict = dataset;
  return dicomDict.write();
}

describe('combineFrameInstance with a DetectorInformationSequence', () => {
  beforeEach(() => {
    removeAllProviders();
    clearCacheData();
    registerDefaultProviders();
  });

  it('returns an image plane for a multi-frame NM instance whose DetectorInformationSequence has no items', async () => {
    const naturalized = await naturalizePart10Buffer(
      writePart10({
        '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.20'] },
        '00080060': { vr: 'CS', Value: ['NM'] },
        '00280008': { vr: 'IS', Value: [2] },
        '00280004': { vr: 'CS', Value: ['MONOCHROME2'] },
        '00280010': { vr: 'US', Value: [64] },
        '00280011': { vr: 'US', Value: [64] },
        '00540022': { vr: 'SQ', Value: [] },
      })
    );
    // The empty Type 2 sequence survives naturalization as an empty array
    expect(naturalized.DetectorInformationSequence).toEqual([]);
    setCacheData(MetadataModules.NATURALIZED, BASE_IMAGE_ID, naturalized);

    const imagePlane = getMetaData(
      MetadataModules.IMAGE_PLANE,
      `${BASE_IMAGE_ID}?frame=2`
    );

    expect(imagePlane.rows).toBe(64);
    expect(imagePlane.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
    expect(imagePlane.imagePositionPatient).toEqual([0, 0, 0]);
    expect(imagePlane.usingDefaultValues).toBe(true);
  });

  it('ignores an empty position and orientation in the detector item', async () => {
    const naturalized = await naturalizePart10Buffer(
      writePart10({
        '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.20'] },
        '00080060': { vr: 'CS', Value: ['NM'] },
        '00280008': { vr: 'IS', Value: [2] },
        '00280004': { vr: 'CS', Value: ['MONOCHROME2'] },
        '00180088': { vr: 'DS', Value: [4.5] },
        '00540022': {
          vr: 'SQ',
          Value: [
            {
              '00200032': { vr: 'DS', Value: [] },
              '00200037': { vr: 'DS', Value: [] },
            },
          ],
        },
      })
    );
    setCacheData(MetadataModules.NATURALIZED, BASE_IMAGE_ID, naturalized);

    const frame = getMetaData(
      MetadataModules.INSTANCE,
      `${BASE_IMAGE_ID}?frame=2`
    );
    expect(frame.ImagePositionPatient).toEqual([0, 0, 2]);

    const imagePlane = getMetaData(
      MetadataModules.IMAGE_PLANE,
      `${BASE_IMAGE_ID}?frame=2`
    );
    expect(imagePlane.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
    expect(imagePlane.rowCosines).toEqual([1, 0, 0]);
    expect(imagePlane.imagePositionPatient).toEqual([0, 0, 2]);
  });

  it('keeps the detector orientation when the detector item has no position', () => {
    const instance = {
      NumberOfFrames: 3,
      SpacingBetweenSlices: 4.5,
      DetectorInformationSequence: [
        { ImageOrientationPatient: [0, 1, 0, 0, 0, -1] },
      ],
    };

    const frame = combineFrameInstance(2, instance);

    expect(frame.ImageOrientationPatient).toEqual([0, 1, 0, 0, 0, -1]);
    expect(frame.ImagePositionPatient).toEqual([0, 0, 2]);
  });

  it('still steps the detector position along the normal by SpacingBetweenSlices', () => {
    const instance = {
      NumberOfFrames: 3,
      SpacingBetweenSlices: 4.5,
      DetectorInformationSequence: [
        {
          ImagePositionPatient: [-120.5, 33.25, 210],
          ImageOrientationPatient: [0, 1, 0, 0, 0, -1],
        },
      ],
    };

    // normal = row x col = (0,1,0) x (0,0,-1) = (-1, 0, 0)
    expect(combineFrameInstance(3, instance).ImagePositionPatient).toEqual([
      -129.5, 33.25, 210,
    ]);
    expect(combineFrameInstance(1, instance).ImagePositionPatient).toEqual([
      -120.5, 33.25, 210,
    ]);
  });
});
