import { describe, it, expect } from '@jest/globals';
import BaseVolumeViewport from '../src/RenderingEngine/BaseVolumeViewport';

const isReferenceViewable = (viewRef, options) =>
  BaseVolumeViewport.prototype.isReferenceViewable.call(
    {
      hasImageURI: (imageId) => imageId === 'wadors:volume-image',
      getFrameOfReferenceUID: () => '1.2.3',
      getCamera: () => ({ viewPlaneNormal: [0, 0, 1] }),
      getSliceIndex: () => 0,
    },
    viewRef,
    options
  );

describe('BaseVolumeViewport.isReferenceViewable', () => {
  it('navigates to an image of the volume when the reference has no frame of reference', () => {
    expect(
      isReferenceViewable(
        {
          referencedImageId: 'wadors:volume-image',
          viewPlaneNormal: [0, 0, 1],
        },
        { withNavigation: true }
      )
    ).toBe(true);
  });

  it('rejects a reference without frame of reference to an image outside the volume', () => {
    expect(
      isReferenceViewable(
        { referencedImageId: 'wadors:other-image', viewPlaneNormal: [0, 0, 1] },
        { withNavigation: true }
      )
    ).toBe(false);
    expect(
      isReferenceViewable({ sliceIndex: 0 }, { withNavigation: true })
    ).toBe(false);
  });

  it('still rejects a reference to another frame of reference', () => {
    expect(
      isReferenceViewable(
        {
          FrameOfReferenceUID: '9.9.9',
          referencedImageId: 'wadors:volume-image',
        },
        { withNavigation: true }
      )
    ).toBe(false);
  });
});
