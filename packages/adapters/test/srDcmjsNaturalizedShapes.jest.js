import { describe, it, expect } from '@jest/globals';
import { data as dcmjsData } from '@dcmjs-org/dcmjs';
import { metaData } from '@cornerstonejs/core';
import MeasurementReport from '../src/adapters/Cornerstone3D/MeasurementReport';
import BaseAdapter3D from '../src/adapters/Cornerstone3D/BaseAdapter3D';
import { RectangleROI } from '../src/adapters/Cornerstone3D/RectangleROI';

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

  it('reads the area of a rectangle group with one NUM content item', () => {
    // TID 1501 shape: the group holds one NUM item, inferred from a SCOORD.
    const group = DicomMetaDictionary.naturalizeDataset({
      '0040A730': {
        vr: 'SQ',
        Value: [
          {
            '0040A040': { vr: 'CS', Value: ['NUM'] },
            '0040A043': { vr: 'SQ', Value: [code('G-A166', 'Area')] },
            '0040A300': {
              vr: 'SQ',
              Value: [
                {
                  '0040A30A': { vr: 'DS', Value: [12.5] },
                  '004008EA': { vr: 'SQ', Value: [code('mm2', 'mm2')] },
                },
              ],
            },
            '0040A730': {
              vr: 'SQ',
              Value: [
                {
                  '0040A040': { vr: 'CS', Value: ['SCOORD'] },
                  '00700023': { vr: 'CS', Value: ['POLYLINE'] },
                  '00700022': { vr: 'FL', Value: [0, 0, 4, 0, 4, 4, 0, 4] },
                  '0040A730': imageReference(),
                },
              ],
            },
          },
        ],
      },
    });
    const plane = {
      frameOfReferenceUID: '1.2.3.5',
      imagePositionPatient: [0, 0, 0],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
    };
    const provider = (type) =>
      type === 'imagePlaneModule' ? plane : undefined;
    metaData.addProvider(provider, 10000);

    try {
      const state = RectangleROI.getMeasurementData(
        group,
        { [`${SOP_INSTANCE_UID}:1`]: 'wadors:image' },
        { get: () => plane }
      );

      const stats = state.annotation.data.cachedStats['imageId:wadors:image'];
      expect(Number(stats.area)).toBe(12.5);
    } finally {
      metaData.removeProvider(provider);
    }
  });
});

function code(CodeValue, CodeMeaning) {
  return {
    '00080100': { vr: 'SH', Value: [CodeValue] },
    '00080102': { vr: 'SH', Value: ['SCT'] },
    '00080104': { vr: 'LO', Value: [CodeMeaning] },
  };
}

function imageReference() {
  return {
    vr: 'SQ',
    Value: [
      {
        '0040A040': { vr: 'CS', Value: ['IMAGE'] },
        '00081199': {
          vr: 'SQ',
          Value: [{ '00081155': { vr: 'UI', Value: [SOP_INSTANCE_UID] } }],
        },
      },
    ],
  };
}
