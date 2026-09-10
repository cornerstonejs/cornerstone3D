/*
 * Jest coverage for the two attributes that say where a segmentation came from:
 * `labelIsGenerated` and `predecessorImageId`.
 *
 * A viewer used to write both attributes onto the state object after
 * `addSegmentations` returned, because the state carried neither one. The
 * public input carries both now, and `normalizeSegmentationInput` puts them on
 * the segmentation.
 */

import { describe, it, expect } from '@jest/globals';

const normalizeSegmentationInput =
  require('../src/stateManagement/segmentation/helpers/normalizeSegmentationInput').default;
const { SegmentationRepresentations } = require('../src/enums');

const PREDECESSOR_IMAGE_ID = 'wadors:predecessor';

/**
 * Normalizes a contour segmentation, which needs no image cache, so the test
 * exercises the config alone.
 */
function normalize(config) {
  return normalizeSegmentationInput({
    segmentationId: 'seg-1',
    representation: {
      type: SegmentationRepresentations.Contour,
      data: {},
    },
    config,
  });
}

describe('normalizeSegmentationInput label origin', () => {
  it('marks a label the caller invented as generated', () => {
    const segmentation = normalize({
      label: 'Segmentation 3',
      labelIsGenerated: true,
    });

    expect(segmentation.label).toBe('Segmentation 3');
    expect(segmentation.labelIsGenerated).toBe(true);
  });

  it('marks a label the user chose as not generated', () => {
    const segmentation = normalize({ label: 'Liver' });

    expect(segmentation.label).toBe('Liver');
    expect(segmentation.labelIsGenerated).toBe(false);
  });

  // A creator that gives no label gives no name that the user chose, so the
  // label counts as generated too, and the viewer must not offer that label as
  // the default name of a later segmentation.
  it('counts an absent label as generated', () => {
    expect(normalize({}).labelIsGenerated).toBe(true);
    expect(normalize(undefined).labelIsGenerated).toBe(true);
  });

  it('keeps an explicit flag that disagrees with the label', () => {
    const segmentation = normalize({ label: '', labelIsGenerated: false });

    expect(segmentation.labelIsGenerated).toBe(false);
  });
});

describe('normalizeSegmentationInput predecessor', () => {
  it('keeps the image id the segmentation was loaded from', () => {
    const segmentation = normalize({
      label: 'Liver',
      predecessorImageId: PREDECESSOR_IMAGE_ID,
    });

    expect(segmentation.predecessorImageId).toBe(PREDECESSOR_IMAGE_ID);
  });

  it('leaves the predecessor undefined for a new segmentation', () => {
    expect(normalize({ label: 'Liver' }).predecessorImageId).toBeUndefined();
  });
});
