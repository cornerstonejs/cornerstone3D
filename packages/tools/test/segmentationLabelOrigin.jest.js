/*
 * Jest coverage for the two attributes that say where a segmentation came from:
 * `labelIsGenerated` and `predecessorImageId`.
 *
 * A viewer used to write both attributes onto the state object after
 * `addSegmentations` returned, because the state carried neither one. The
 * public input carries both now, and `normalizeSegmentationInput` puts them on
 * the segmentation.
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock(
  '../src/stateManagement/segmentation/triggerSegmentationEvents',
  () => ({
    triggerSegmentationModified: jest.fn(),
    triggerSegmentationRepresentationModified: jest.fn(),
    triggerSegmentationRemoved: jest.fn(),
    triggerSegmentationRepresentationRemoved: jest.fn(),
    triggerSegmentationDataModified: jest.fn(),
  })
);

const normalizeSegmentationInput =
  require('../src/stateManagement/segmentation/helpers/normalizeSegmentationInput').default;
const SegmentationStateManager =
  require('../src/stateManagement/segmentation/SegmentationStateManager').default;
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

describe('updateSegmentation label origin', () => {
  /** Puts a generated segmentation in a state manager of its own. */
  function givenGeneratedSegmentation() {
    const manager = new SegmentationStateManager('label-origin-test');

    manager.addSegmentation(
      normalize({ label: 'Segmentation 3', labelIsGenerated: true })
    );

    return manager;
  }

  // The viewer renames a segmentation through this method, and the renamed
  // segmentation holds a name that the user chose.
  it('clears the flag when the payload replaces the label', () => {
    const manager = givenGeneratedSegmentation();

    manager.updateSegmentation('seg-1', { label: 'Liver' });

    expect(manager.getSegmentation('seg-1').labelIsGenerated).toBe(false);
  });

  // The user can type the generated name, and the typed name is still a name
  // that the user chose. A comparison of the two strings misses this case.
  it('clears the flag for a rename to the generated name', () => {
    const manager = givenGeneratedSegmentation();

    manager.updateSegmentation('seg-1', { label: 'Segmentation 3' });

    expect(manager.getSegmentation('seg-1').labelIsGenerated).toBe(false);
  });

  it('keeps an explicit flag that the payload carries', () => {
    const manager = givenGeneratedSegmentation();

    manager.updateSegmentation('seg-1', {
      label: 'Segmentation 4',
      labelIsGenerated: true,
    });

    expect(manager.getSegmentation('seg-1').labelIsGenerated).toBe(true);
  });

  it('leaves the flag alone when the payload holds no label', () => {
    const manager = givenGeneratedSegmentation();

    manager.updateSegmentation('seg-1', { cachedStats: { count: 1 } });

    expect(manager.getSegmentation('seg-1').labelIsGenerated).toBe(true);
  });

  // A caller that builds the payload from an optional field sends the key with
  // the value `undefined`. A test of the key alone read that as a rename, and
  // the generated name became a name that the user chose.
  it('leaves the flag alone for a label with no value', () => {
    const manager = givenGeneratedSegmentation();

    manager.updateSegmentation('seg-1', { label: undefined });

    expect(manager.getSegmentation('seg-1').labelIsGenerated).toBe(true);
  });

  // The same payload must not turn an explicit flag into a generated one.
  it('clears the flag for a rename beside a flag with no value', () => {
    const manager = givenGeneratedSegmentation();

    manager.updateSegmentation('seg-1', {
      label: 'Liver',
      labelIsGenerated: undefined,
    });

    expect(manager.getSegmentation('seg-1').labelIsGenerated).toBe(false);
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
