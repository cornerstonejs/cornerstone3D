import { metaData } from '@cornerstonejs/core';
import validateAndSortVolumeIds from '../demo/helpers/validateAndSortVolumeIds';

describe('validateAndSortVolumeIds', () => {
  const provider = (type, imageId) => {
    if (type !== 'imagePlaneModule') {
      return;
    }
    return planesById.get(imageId);
  };

  let planesById;

  beforeEach(() => {
    planesById = new Map();
    metaData.addProvider(provider, 9999);
  });

  afterEach(() => {
    metaData.removeProvider(provider);
    planesById.clear();
  });

  function addSeries(ids, { forUid = '1', iop = [1, 0, 0, 0, 1, 0], zStep = 1 }) {
    ids.forEach((id, i) => {
      planesById.set(id, {
        frameOfReferenceUID: forUid,
        imageOrientationPatient: [...iop],
        imagePositionPatient: [0, 0, i * zStep],
      });
    });
  }

  it('returns valid for coherent stack', () => {
    const ids = ['img3', 'img1', 'img2'];
    addSeries(ids, { zStep: 2 });

    const result = validateAndSortVolumeIds(ids);

    expect(result.valid).toBe(true);
    expect(result.sortedImageIds).toHaveLength(3);
  });

  it('rejects frame of reference changes', () => {
    const ids = ['a', 'b', 'c'];
    addSeries(ids, { forUid: 'FOR-A' });
    planesById.set('c', {
      frameOfReferenceUID: 'FOR-B',
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      imagePositionPatient: [0, 0, 2],
    });

    const result = validateAndSortVolumeIds(ids);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('frame of reference');
  });
});
