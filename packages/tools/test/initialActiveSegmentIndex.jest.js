/*
 * Jest coverage for the initial active segment that
 * `internalAddSegmentationRepresentation` picks when the segmentation has no
 * active segment yet. It must be the lowest segment index, compared as
 * numbers: for segments 2, 3 and 10 that is 2, not 10 (the first one in
 * string order).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElementByViewportId: jest.fn(() => undefined),
}));

jest.mock(
  '../src/stateManagement/segmentation/helpers/isSegmentationOverlayCompatible',
  () => ({ isSegmentationOverlayCompatible: jest.fn(() => true) })
);

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

jest.mock('../src/utilities/triggerAnnotationRenderForViewportIds', () => ({
  triggerAnnotationRenderForViewportIds: jest.fn(),
}));

const normalizeSegmentationInput =
  require('../src/stateManagement/segmentation/helpers/normalizeSegmentationInput').default;
const {
  defaultSegmentationStateManager,
} = require('../src/stateManagement/segmentation/SegmentationStateManager');
const {
  internalAddSegmentationRepresentation,
} = require('../src/stateManagement/segmentation/internalAddSegmentationRepresentation');
const {
  getActiveSegmentIndex,
} = require('../src/stateManagement/segmentation/getActiveSegmentIndex');
const { SegmentationRepresentations } = require('../src/enums');

const SEGMENTATION_ID = 'initial-active-segment-seg';
const VIEWPORT_ID = 'initial-active-segment-viewport';

/** Registers a contour segmentation that holds the given segment indices. */
function addSegmentationWithSegments(segmentIndices) {
  const segments = {};
  segmentIndices.forEach((segmentIndex) => {
    segments[segmentIndex] = {};
  });

  defaultSegmentationStateManager.addSegmentation(
    normalizeSegmentationInput({
      segmentationId: SEGMENTATION_ID,
      representation: {
        type: SegmentationRepresentations.Contour,
        data: {},
      },
      config: { segments },
    })
  );
}

describe('internalAddSegmentationRepresentation initial active segment', () => {
  beforeEach(() => {
    defaultSegmentationStateManager.resetState();
  });

  it('activates the numerically lowest segment index', () => {
    addSegmentationWithSegments([2, 3, 10]);

    internalAddSegmentationRepresentation(VIEWPORT_ID, {
      segmentationId: SEGMENTATION_ID,
      type: SegmentationRepresentations.Contour,
    });

    expect(getActiveSegmentIndex(SEGMENTATION_ID)).toBe(2);
  });
});
