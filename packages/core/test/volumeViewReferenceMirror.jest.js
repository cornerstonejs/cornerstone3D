jest.mock('../src/utilities/getVolumeViewportScrollInfo', () => jest.fn());
jest.mock('../src/utilities/snapFocalPointToSlice', () => jest.fn());

import BaseVolumeViewport from '../src/RenderingEngine/BaseVolumeViewport';
import getVolumeViewportScrollInfo from '../src/utilities/getVolumeViewportScrollInfo';
import snapFocalPointToSlice from '../src/utilities/snapFocalPointToSlice';

describe('BaseVolumeViewport.setViewReference with an opposite normal', () => {
  it('maps slice k of the opposite view to slice M - k', () => {
    // M = 5: the grid has the slices 0..5.
    getVolumeViewportScrollInfo.mockReturnValue({
      currentStepIndex: 0,
      numScrollSteps: 5,
      sliceRangeInfo: {
        sliceRange: { min: 0, max: 10, current: 0 },
        spacingInNormalDirection: 2,
      },
    });
    snapFocalPointToSlice.mockReturnValue({
      newFocalPoint: [0, 0, 0],
      newPosition: [0, 0, 10],
    });
    const viewport = {
      getVolumeId: () => 'volume',
      _getDimensionGroupNumber: () => 0,
      getFrameOfReferenceUID: () => 'for',
      getCamera: () => ({
        focalPoint: [0, 0, 0],
        position: [0, 0, 10],
        viewPlaneNormal: [0, 0, -1],
      }),
      setCamera: jest.fn(),
    };

    BaseVolumeViewport.prototype.setViewReference.call(viewport, {
      FrameOfReferenceUID: 'for',
      volumeId: 'volume',
      sliceIndex: 1,
      viewPlaneNormal: [0, 0, 1],
    });

    // Slice 1 of the opposite view is slice 4 of this view: a delta of 4.
    expect(snapFocalPointToSlice.mock.calls[0][5]).toBe(4);
  });
});
