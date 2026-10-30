import { describe, it, expect } from '@jest/globals';
import { fidelityDetailsTextOf } from '../src/RenderingEngine/helpers/fidelityIndicator/fidelityDetailsText';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';

describe('fidelityDetailsTextOf (FIDELITY-UI-5)', () => {
  it('describes an incomplete load with progress and wait (DISCOVER-1..3)', () => {
    const text = fidelityDetailsTextOf({
      cause: 'incompleteLoad',
      transient: true,
      progressive: {
        status: ImageQualityStatus.SUBRESOLUTION,
        missing: 100,
        voxels: 1000,
        loadedFraction: 0.9,
      },
    });

    expect(text).toContain('still loading');
    expect(text).toContain('90% of data arrived');
    expect(text).toContain('Waiting should improve');
    expect(text).not.toMatch(/GPU|texture|HTJ2K|sample distance/i);
  });

  it('describes standing device reduction with magnitude and no wait', () => {
    const text = fidelityDetailsTextOf({
      cause: 'deviceTextureLimit',
      transient: false,
      magnitude: [1, 1, 2],
    });

    expect(text).toContain('Image detail is reduced');
    expect(text).toContain('Reduction: i/1, j/1, k/2');
    expect(text).not.toContain('Waiting should improve');
    expect(text).not.toMatch(/GPU|texture|boxAverage|clientDerived/i);
  });

  it('reports full detail for a reduced texture when the view is lossless', () => {
    const text = fidelityDetailsTextOf({
      cause: 'deviceTextureLimit',
      transient: false,
      magnitude: [1, 1, 2],
      shownState: 'done',
      lossy: false,
    });

    expect(text).toBe('Image is at full available detail.');
  });

  it('describes interactive LOD without jargon', () => {
    const text = fidelityDetailsTextOf({
      cause: 'performanceTarget',
      transient: true,
    });

    expect(text).toContain('while you interact');
    expect(text).toContain('Full detail returns when interaction stops');
    expect(text).not.toMatch(/LOD|sample distance|GPU/i);
  });

  it('describes lossy decode without IQS enum names', () => {
    const text = fidelityDetailsTextOf({
      cause: 'lossyDecode',
      transient: false,
      progressive: { status: ImageQualityStatus.LOSSY },
    });

    expect(text).toContain('reduced decode quality');
    expect(text).not.toContain('LOSSY');
    expect(text).not.toMatch(/GPU|texture/i);
  });

  it('reports empty and full states without developer dump', () => {
    expect(fidelityDetailsTextOf({})).toBe(
      'No image data in this viewport yet'
    );
    expect(fidelityDetailsTextOf({ shownState: 'done', lossy: false })).toBe(
      'Image is at full available detail.'
    );
  });
});
