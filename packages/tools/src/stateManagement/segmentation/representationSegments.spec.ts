jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElementByViewportId: () => ({}),
}));

import { eventTarget } from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../enums';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { removeSegment } from './removeSegment';
import { setActiveSegmentIndex } from './segmentIndex';

const segmentationId = 'segmentation';
const viewportIds = ['viewport-1', 'viewport-2'];
const { Contour } = SegmentationRepresentations;

function createSegment(segmentIndex: number, active: boolean) {
  return { segmentIndex, label: '', locked: false, cachedStats: {}, active };
}

describe('viewport representation segments', () => {
  const listener = jest.fn();

  const getModified = () =>
    listener.mock.calls.map(([{ detail }]) => ({ ...detail }));

  const getSegmentsPerViewport = () =>
    viewportIds.map(
      (viewportId) =>
        defaultSegmentationStateManager.getSegmentationRepresentations(
          viewportId,
          { segmentationId }
        )[0].segments
    );

  beforeEach(() => {
    defaultSegmentationStateManager.addSegmentation({
      segmentationId,
      label: 'Segmentation',
      cachedStats: {},
      segments: { 1: createSegment(1, true), 2: createSegment(2, false) },
      representationData: { Contour: { annotationUIDsMap: new Map() } },
    });
    viewportIds.forEach((viewportId) =>
      defaultSegmentationStateManager.addSegmentationRepresentation(
        viewportId,
        segmentationId,
        Contour
      )
    );
    listener.mockClear();
    eventTarget.addEventListener(
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      listener
    );
  });

  afterEach(() => {
    eventTarget.removeEventListener(
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      listener
    );
    defaultSegmentationStateManager.resetState();
  });

  const modifiedInEachViewport = viewportIds.map((viewportId) => ({
    segmentationId,
    type: Contour,
    viewportId,
  }));

  it('fires a modified event per viewport when a segment is removed', () => {
    removeSegment(segmentationId, 2);

    getSegmentsPerViewport().forEach((segments) =>
      expect(segments).not.toHaveProperty('2')
    );
    expect(getModified()).toEqual(modifiedInEachViewport);
  });

  it('fires a modified event per viewport when activation adds a segment', () => {
    setActiveSegmentIndex(segmentationId, 3);

    getSegmentsPerViewport().forEach((segments) =>
      expect(segments[3]).toEqual({ visible: true })
    );
    expect(getModified()).toEqual(modifiedInEachViewport);
  });

  it('fires no modified event when the viewport segments do not change', () => {
    setActiveSegmentIndex(segmentationId, 2);

    expect(getModified()).toEqual([]);
  });
});
