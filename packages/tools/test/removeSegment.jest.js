/*
 * Jest coverage for the segment that `removeSegment` makes active when the
 * removed segment was the active one. The documented rule: the next segment
 * becomes active, or the previous one when there is no next segment.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

const {
  addSegmentations,
  removeSegment,
} = require('../src/stateManagement/segmentation');
const {
  getSegmentation,
} = require('../src/stateManagement/segmentation/getSegmentation');
const {
  getActiveSegmentIndex,
  setActiveSegmentIndex,
} = require('../src/stateManagement/segmentation/segmentIndex');
const {
  defaultSegmentationStateManager,
} = require('../src/stateManagement/segmentation/SegmentationStateManager');
const { SegmentationRepresentations } = require('../src/enums');

const SEGMENTATION_ID = 'remove-segment-test';

/**
 * Adds a contour segmentation with the given segment indices and makes
 * `activeSegmentIndex` active. A contour segmentation needs no image cache.
 */
function givenSegments(segmentIndices, activeSegmentIndex) {
  const segments = {};
  segmentIndices.forEach((segmentIndex) => {
    segments[segmentIndex] = { label: `Segment ${segmentIndex}` };
  });

  addSegmentations([
    {
      segmentationId: SEGMENTATION_ID,
      representation: {
        type: SegmentationRepresentations.Contour,
        data: {},
      },
      config: { segments },
    },
  ]);

  setActiveSegmentIndex(SEGMENTATION_ID, activeSegmentIndex);
}

function segmentIndicesInState() {
  return Object.keys(getSegmentation(SEGMENTATION_ID).segments).map(Number);
}

describe('removeSegment active segment', () => {
  beforeEach(() => {
    defaultSegmentationStateManager.resetState();
  });

  it('activates the next higher segment', () => {
    givenSegments([1, 2, 3, 4], 3);

    removeSegment(SEGMENTATION_ID, 3);

    expect(segmentIndicesInState()).toEqual([1, 2, 4]);
    expect(getActiveSegmentIndex(SEGMENTATION_ID)).toBe(4);
  });

  it('activates the next higher segment across a gap in the indices', () => {
    givenSegments([1, 2, 5, 7], 2);

    removeSegment(SEGMENTATION_ID, 2);

    expect(getActiveSegmentIndex(SEGMENTATION_ID)).toBe(5);
  });

  it('activates the next lower segment when the highest one is removed', () => {
    givenSegments([1, 2, 3, 4], 4);

    removeSegment(SEGMENTATION_ID, 4);

    expect(segmentIndicesInState()).toEqual([1, 2, 3]);
    expect(getActiveSegmentIndex(SEGMENTATION_ID)).toBe(3);
  });

  it('activates the next segment when the lowest one is removed', () => {
    givenSegments([1, 2, 3], 1);

    removeSegment(SEGMENTATION_ID, 1);

    expect(getActiveSegmentIndex(SEGMENTATION_ID)).toBe(2);
  });

  it('leaves no segment active when the only segment is removed', () => {
    givenSegments([1], 1);

    removeSegment(SEGMENTATION_ID, 1);

    expect(segmentIndicesInState()).toEqual([]);
    expect(getActiveSegmentIndex(SEGMENTATION_ID)).toBeUndefined();
  });

  it('keeps the active segment when an inactive one is removed', () => {
    givenSegments([1, 2, 3, 4], 2);

    removeSegment(SEGMENTATION_ID, 3);

    expect(getActiveSegmentIndex(SEGMENTATION_ID)).toBe(2);
  });

  it('activates no segment when setNextSegmentAsActive is false', () => {
    givenSegments([1, 2, 3, 4], 3);

    removeSegment(SEGMENTATION_ID, 3, { setNextSegmentAsActive: false });

    expect(getActiveSegmentIndex(SEGMENTATION_ID)).toBeUndefined();
  });
});
