import dcmjs from '@dcmjs-org/dcmjs';
import { getPrivateTagValue } from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

const PHILIPS = 'Philips PET Private Group';

describe('getPrivateTagValue', () => {
  it('reads the dcmjs 1.0 block form, also after a spread or a JSON copy', () => {
    const naturalized = dcmjs.data.DicomMetaDictionary.naturalizeDataset({
      70530011: { vr: 'LO', Value: [PHILIPS] },
      70531109: { vr: 'DS', Value: [1.88] },
    });
    const copies = [
      { ...naturalized },
      JSON.parse(JSON.stringify(naturalized)),
    ];
    for (const copy of copies) {
      expect(getPrivateTagValue(copy, 0x7053, PHILIPS, 0x09)).toEqual([1.88]);
      expect(getPrivateTagValue(copy, '7053', `${PHILIPS} `, '09')).toEqual([
        1.88,
      ]);
    }
  });

  it('reads the hex-key form in the block that the creator reserved', () => {
    const dataset = {
      '00090010': ['GEMS_IDEN_01'],
      '00090012': 'GEMS_PETD_01 ',
      '0009100d': 'wrong block',
      '0009120d': ['20130606113000.00'],
    };
    expect(getPrivateTagValue(dataset, 0x0009, 'GEMS_PETD_01', 0x0d)).toEqual([
      '20130606113000.00',
    ]);
  });

  it('gives undefined when the creator is absent', () => {
    const dataset = { 70531009: [1.88], '7053:Other': { x09: [2] } };
    expect(getPrivateTagValue(dataset, 0x7053, PHILIPS, 0x09)).toBeUndefined();
  });
});
