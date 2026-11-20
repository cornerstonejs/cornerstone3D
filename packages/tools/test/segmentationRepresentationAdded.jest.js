/*
 * Jest coverage for SEGMENTATION_REPRESENTATION_ADDED (open issue 87). The
 * event was declared and listened to, but no code fired it, in 5.x too. The
 * state manager fires it once for each representation that it adds to a
 * viewport, with the detail of a representation event: the segmentation id,
 * the type and the viewport id.
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    getEnabledElementByViewportId: jest.fn((viewportId) =>
      viewportId === 'disabled-viewport' ? undefined : { viewport: {} }
    ),
  };
});

const { eventTarget } = require('@cornerstonejs/core');
const SegmentationStateManager =
  require('../src/stateManagement/segmentation/SegmentationStateManager').default;
const { Events, SegmentationRepresentations } = require('../src/enums');

const { Contour } = SegmentationRepresentations;

/** A contour segmentation, which needs no image cache. */
function contourSegmentation(segmentationId) {
  return {
    segmentationId,
    label: segmentationId,
    segments: { 1: { segmentIndex: 1, active: true } },
    representationData: {
      Contour: { annotationUIDsMap: new Map() },
    },
  };
}

describe('SEGMENTATION_REPRESENTATION_ADDED', () => {
  let manager;
  let added;
  let modified;

  const onAdded = (evt) => added.push(evt.detail);
  const onModified = (evt) => modified.push(evt.detail);

  beforeEach(() => {
    added = [];
    modified = [];
    manager = new SegmentationStateManager('representation-added-test');
    manager.addSegmentation(contourSegmentation('seg-1'));
    eventTarget.addEventListener(
      Events.SEGMENTATION_REPRESENTATION_ADDED,
      onAdded
    );
    eventTarget.addEventListener(
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      onModified
    );
  });

  afterEach(() => {
    eventTarget.removeEventListener(
      Events.SEGMENTATION_REPRESENTATION_ADDED,
      onAdded
    );
    eventTarget.removeEventListener(
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      onModified
    );
  });

  it('fires once when a representation is added to a viewport, with the segmentation id, the type and the viewport id', () => {
    manager.addSegmentationRepresentation('viewport-1', 'seg-1', Contour);

    expect(added).toEqual([
      { segmentationId: 'seg-1', type: Contour, viewportId: 'viewport-1' },
    ]);
  });

  it('fires once more for each other viewport, and not again for a representation that the viewport has', () => {
    manager.addSegmentationRepresentation('viewport-1', 'seg-1', Contour);
    manager.addSegmentationRepresentation('viewport-1', 'seg-1', Contour);
    manager.addSegmentationRepresentation('viewport-2', 'seg-1', Contour);

    expect(added).toEqual([
      { segmentationId: 'seg-1', type: Contour, viewportId: 'viewport-1' },
      { segmentationId: 'seg-1', type: Contour, viewportId: 'viewport-2' },
    ]);
  });

  it('keeps firing SEGMENTATION_REPRESENTATION_MODIFIED for each call, as before', () => {
    manager.addSegmentationRepresentation('viewport-1', 'seg-1', Contour);
    manager.addSegmentationRepresentation('viewport-1', 'seg-1', Contour);

    expect(modified).toEqual([
      { segmentationId: 'seg-1', type: Contour, viewportId: 'viewport-1' },
      { segmentationId: 'seg-1', type: Contour, viewportId: 'viewport-1' },
    ]);
  });

  it('does not fire when nothing is added: an unknown segmentation, or a viewport that is not enabled', () => {
    manager.addSegmentationRepresentation('viewport-1', 'unknown', Contour);
    manager.addSegmentationRepresentation(
      'disabled-viewport',
      'seg-1',
      Contour
    );

    expect(added).toEqual([]);
  });
});
