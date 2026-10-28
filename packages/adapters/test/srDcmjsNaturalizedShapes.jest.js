import { describe, it, expect } from '@jest/globals';
import { data as dcmjsData } from '@dcmjs-org/dcmjs';
import MeasurementReport from '../src/adapters/Cornerstone3D/MeasurementReport';
import BaseAdapter3D from '../src/adapters/Cornerstone3D/BaseAdapter3D';

const { DicomMetaDictionary } = dcmjsData;

/**
 * dcmjs 1.0 naturalizes a one-item sequence as the item object (not an array)
 * and keeps ReferencedFrameNumber (VM 1-n) as a list. An SR that references a
 * frame of a multiframe image must still resolve to that frame.
 */
const SOP_INSTANCE_UID = '1.2.3.4';

function naturalizeMeasurementGroup() {
  return DicomMetaDictionary.naturalizeDataset({
    // ContentSequence with one SCOORD item
    '0040A730': {
      vr: 'SQ',
      Value: [
        {
          '0040A040': { vr: 'CS', Value: ['SCOORD'] },
          '00700023': { vr: 'CS', Value: ['POINT'] },
          '00700022': { vr: 'FL', Value: [1, 2] },
          '0040A730': {
            vr: 'SQ',
            Value: [
              {
                '0040A040': { vr: 'CS', Value: ['IMAGE'] },
                '00081199': {
                  vr: 'SQ',
                  Value: [
                    {
                      '00081155': { vr: 'UI', Value: [SOP_INSTANCE_UID] },
                      '00081160': { vr: 'IS', Value: [3] },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  });
}

describe('SR read through dcmjs naturalizeDataset', () => {
  it('finds the graphic item of a group with one content item', () => {
    const group = naturalizeMeasurementGroup();

    const items = BaseAdapter3D.getGraphicItems(group, undefined);

    expect(items).toHaveLength(1);
    expect(items[0].GraphicType).toBe('POINT');
  });

  it('resolves the referenced frame of a multiframe image', () => {
    const group = naturalizeMeasurementGroup();
    const SCOORDGroup = BaseAdapter3D.getGraphicItem(group);
    const metadata = { get: () => ({ frameOfReferenceUID: '1.2.3.5' }) };

    const result = MeasurementReport.processSCOORDGroup({
      SCOORDGroup,
      toolType: 'Probe',
      sopInstanceUIDToImageIdMap: {
        [`${SOP_INSTANCE_UID}:3`]: 'wadors:frame3',
      },
      metadata,
    });

    expect(result.ReferencedFrameNumber).toBe(3);
    expect(result.referencedImageId).toBe('wadors:frame3');
  });
});
