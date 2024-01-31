import { getVolumeId } from '../../tools/src/utilities/getVolumeId';

describe('getVolumeId', () => {
  it('should extract volumeId from target', () => {
    const targetId = 'volumeId:aaaa';
    expect(getVolumeId(targetId)).toEqual('aaaa');
  });

  it('should extract volumeId from a complex nifti url', () => {
    const targetId = 'nifti:https://nifti.com?xoxo';
    expect(getVolumeId(targetId)).toEqual('nifti:https://nifti.com?xoxo');
  });
});
