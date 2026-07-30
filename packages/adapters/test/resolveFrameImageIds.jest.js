import { describe, it, expect } from '@jest/globals';
import { resolveFrameImageIds } from '../src/adapters/Cornerstone3D/Segmentation/labelmapImagesFromBuffer';

describe('resolveFrameImageIds', () => {
  it('returns explicitly provided frameImageIds as-is', () => {
    const frameImageIds = ['a?frame=1', 'a?frame=2'];
    expect(
      resolveFrameImageIds({
        segImageId: 'a',
        numberOfFrames: 2,
        frameImageIds,
      })
    ).toBe(frameImageIds);
  });

  it('builds frame imageIds from a getFrameImageId callback', () => {
    const result = resolveFrameImageIds({
      segImageId: 'seg',
      numberOfFrames: 3,
      getFrameImageId: (base, frameNumber) => `${base}#${frameNumber}`,
    });
    expect(result).toEqual(['seg#1', 'seg#2', 'seg#3']);
  });

  it('auto-expands a WADO-RS /frames/N imageId', () => {
    const result = resolveFrameImageIds({
      segImageId: 'wadors:https://x/studies/1/series/2/instances/3/frames/1',
      numberOfFrames: 3,
    });
    expect(result).toEqual([
      'wadors:https://x/studies/1/series/2/instances/3/frames/1',
      'wadors:https://x/studies/1/series/2/instances/3/frames/2',
      'wadors:https://x/studies/1/series/2/instances/3/frames/3',
    ]);
  });

  it('auto-expands a WADO-URI imageId with ?frame=', () => {
    const result = resolveFrameImageIds({
      segImageId: 'wadouri:https://x/seg.dcm',
      numberOfFrames: 2,
    });
    expect(result).toEqual([
      'wadouri:https://x/seg.dcm?frame=1',
      'wadouri:https://x/seg.dcm?frame=2',
    ]);
  });

  it('auto-expands a WADO-URI imageId that already has a query with &frame=', () => {
    const result = resolveFrameImageIds({
      segImageId: 'wadouri:https://x/seg.dcm?foo=bar',
      numberOfFrames: 2,
    });
    expect(result).toEqual([
      'wadouri:https://x/seg.dcm?foo=bar&frame=1',
      'wadouri:https://x/seg.dcm?foo=bar&frame=2',
    ]);
  });

  it('auto-expands a dicomfile: imageId', () => {
    const result = resolveFrameImageIds({
      segImageId: 'dicomfile:42',
      numberOfFrames: 2,
    });
    expect(result).toEqual(['dicomfile:42?frame=1', 'dicomfile:42?frame=2']);
  });

  it('returns a single id for single-frame SEG', () => {
    expect(
      resolveFrameImageIds({
        segImageId: 'wadouri:https://x/seg.dcm',
        numberOfFrames: 1,
      })
    ).toEqual(['wadouri:https://x/seg.dcm']);
  });

  it('throws for a multiframe unrecognized scheme instead of repeating the base id', () => {
    // Repeating the base id would decode frame 1 and paint it onto every slice,
    // silently corrupting the segmentation. Callers must pass frameImageIds /
    // getFrameImageId for schemes the adapter cannot address per-frame.
    expect(() =>
      resolveFrameImageIds({
        segImageId: 'custom:opaque-handle',
        numberOfFrames: 3,
      })
    ).toThrow(/Cannot derive per-frame imageIds/);
  });

  it('returns the single base id for an unrecognized scheme when single-frame', () => {
    expect(
      resolveFrameImageIds({
        segImageId: 'custom:opaque-handle',
        numberOfFrames: 1,
      })
    ).toEqual(['custom:opaque-handle']);
  });
});
