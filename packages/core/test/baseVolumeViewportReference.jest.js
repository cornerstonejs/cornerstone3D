import { describe, it, expect, jest, afterEach } from '@jest/globals';
import BaseVolumeViewport from '../src/RenderingEngine/BaseVolumeViewport';
import Viewport from '../src/RenderingEngine/Viewport';
import * as metaData from '../src/metaData';

const isReferenceViewable = (viewRef, options) =>
  BaseVolumeViewport.prototype.isReferenceViewable.call(
    {
      hasImageURI: (imageId) => imageId === 'wadors:volume-image',
      getFrameOfReferenceUID: () => '1.2.3',
      getCamera: () => ({ focalPoint: [0, 0, 0], viewPlaneNormal: [0, 0, 1] }),
      getSliceIndex: () => 0,
      isPlaneViewable: Viewport.prototype.isPlaneViewable,
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

  it('accepts a plane restriction without frame of reference for an image of the volume', () => {
    expect(
      isReferenceViewable(
        {
          referencedImageId: 'wadors:volume-image',
          planeRestriction: {
            point: [0, 0, 5],
            inPlaneVector1: [1, 0, 0],
            inPlaneVector2: [0, 1, 0],
          },
        },
        { withNavigation: true }
      )
    ).toBe(true);
  });

  it('still rejects a plane restriction in another frame of reference', () => {
    expect(
      isReferenceViewable(
        {
          referencedImageId: 'wadors:volume-image',
          planeRestriction: {
            FrameOfReferenceUID: '9.9.9',
            point: [0, 0, 5],
            inPlaneVector1: [1, 0, 0],
            inPlaneVector2: [0, 1, 0],
          },
        },
        { withNavigation: true }
      )
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

describe('BaseVolumeViewport.setViewReference', () => {
  const imagePlaneProvider = (type, imageId) =>
    type === 'imagePlaneModule' && imageId === 'wadors:volume-image'
      ? { imagePositionPatient: [0, 0, 5] }
      : undefined;

  afterEach(() => {
    metaData.removeProvider(imagePlaneProvider);
  });

  it('navigates to an image of the volume when only the volume has a frame of reference', () => {
    metaData.addProvider(imagePlaneProvider, 10000);
    const setCamera = jest.fn();
    const viewport = {
      getVolumeId: () => 'volume',
      getCamera: () => ({
        focalPoint: [0, 0, 0],
        position: [0, 0, 10],
        viewPlaneNormal: [0, 0, 1],
      }),
      getFrameOfReferenceUID: () => '1.2.3',
      hasImageURI: (imageId) => imageId === 'wadors:volume-image',
      isInAcquisitionPlane: () => true,
      setCamera,
      render: () => {},
    };

    BaseVolumeViewport.prototype.setViewReference.call(viewport, {
      referencedImageId: 'wadors:volume-image',
      viewPlaneNormal: [0, 0, 1],
    });

    expect(setCamera).toHaveBeenCalledTimes(1);
    const { focalPoint, position } = setCamera.mock.calls[0][0];
    expect(Array.from(focalPoint)).toEqual([0, 0, 5]);
    expect(Array.from(position)).toEqual([0, 0, 15]);
  });
});
