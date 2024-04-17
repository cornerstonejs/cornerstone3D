import { getVolumeId } from '../../core/src/utilities/getVolumeId';

describe('getVolumeId', () => {
  it('should extract volumeId from target', () => {
    const targetId = 'volumeId:123456';
    expect(getVolumeId(targetId)).toEqual('123456');
  });
  // it('should extract volumeId from a complex nifti url', () => {
  //   const targetId = 'volumeId:nifti:https://nifti.com/img.tar.nz?a=1&b=2';
  //   expect(getVolumeId(targetId)).toEqual(
  //     'nifti:https://nifti.com/img.tar.nz?a=1&b=2'
  //   );
  // });
  // it('should extract volumeId from a complex nifti url without volumeId:', () => {
  //   const targetId = 'nifti:https://nifti.com/img.tar.nz?a=1&b=2';
  //   expect(getVolumeId(targetId)).toEqual(
  //     'nifti:https://nifti.com/img.tar.nz?a=1&b=2'
  //   );
  // });
});
