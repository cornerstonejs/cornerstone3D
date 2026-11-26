import {
  getViewportContourCutsState,
  removeContourCuts,
  updateContourCuts,
  updateContourCutsOfModifiedSegmentation,
} from './contourCuts';
import { getAddOns, getPolySeg } from '../../../config';
import { removeAnnotation } from '../../../stateManagement/annotation/annotationState';
import { utilities } from '@cornerstonejs/core';

const AXIAL = [0, 0, -1];
const SAGITTAL = [1, 0, 0];
const CORONAL = [0, -1, 0];

const mockAnnotations = new Map();
const mockSegmentations = new Map();
const mockViewports = new Map();
const mockGeometries = new Map();
const mockTriggerEvent = jest.fn();

jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getGeometry: (geometryId) => mockGeometries.get(geometryId),
    removeGeometryLoadObject: (geometryId) => mockGeometries.delete(geometryId),
  },
  CONSTANTS: { EPSILON: 1e-3 },
  eventTarget: {},
  triggerEvent: (...args) => mockTriggerEvent(...args),
  Enums: {
    ViewportType: { VOLUME_3D: 'volume3d' },
    Events: { IMAGE_RENDERED: 'IMAGE_RENDERED' },
  },
  getEnabledElementByViewportId: (viewportId) =>
    mockViewports.has(viewportId)
      ? { viewport: mockViewports.get(viewportId) }
      : undefined,
  utilities: {
    logger: {
      toolsLog: {
        getLogger: (() => {
          const logger = { warn: jest.fn(), debug: jest.fn() };

          return () => logger;
        })(),
      },
    },
    getViewportContentMode: (viewport) => viewport.mode,
  },
}));

jest.mock('../../../config', () => {
  const polySeg = {
    computeSurfaceData: jest.fn(),
    clipAndCacheSurfacesForViewport: jest.fn(async () => new Map()),
    extractContourData: jest.fn(
      () =>
        new Map([
          [1, [{ points: [], lines: [], numberOfCells: 1, sliceIndex: 0 }]],
        ])
    ),
    createAndAddContourSegmentationsFromClippedSurfaces: jest.fn(),
  };

  return {
    getAddOns: jest.fn(() => ({ polySeg })),
    getPolySeg: () => polySeg,
  };
});

jest.mock('../../../stateManagement/annotation/annotationState', () => ({
  getAnnotation: (annotationUID) => mockAnnotations.get(annotationUID),
  removeAnnotation: jest.fn(),
}));

jest.mock('../../../utilities/triggerAnnotationRenderForViewportIds', () => ({
  triggerAnnotationRenderForViewportIds: jest.fn(),
}));

jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: (segmentationId) => mockSegmentations.get(segmentationId),
}));

/**
 * Adds a contour segmentation whose segments have contour annotations with
 * the view plane normals given, and the surfaces that the mocked PolySeg
 * add-on gives for them.
 */
function addSegmentation(segmentationId, normalsBySegment) {
  const annotationUIDsMap = new Map();

  Object.entries(normalsBySegment).forEach(([segmentIndex, normals]) => {
    const annotationUIDs = new Set<string>();

    (normals as number[][]).forEach((viewPlaneNormal, index) => {
      const annotationUID = `${segmentationId}-${segmentIndex}-${index}`;

      mockAnnotations.set(annotationUID, { metadata: { viewPlaneNormal } });
      annotationUIDs.add(annotationUID);
    });
    annotationUIDsMap.set(Number(segmentIndex), annotationUIDs);
    mockGeometries.set(`${segmentationId}-surface-${segmentIndex}`, {
      data: { points: [0, 0, 0], polys: [1, 0] },
    });
  });

  mockSegmentations.set(segmentationId, {
    segmentationId,
    representationData: {
      Contour: { geometryIds: ['geometry'], annotationUIDsMap },
    },
  });
}

/** A planar viewport in volume mode with this view plane normal. */
function addViewport(id, viewPlaneNormal, volumeId = 'volume') {
  const viewport = {
    id,
    type: 'planar',
    mode: 'volume',
    element: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
    getVolumeId: () => volumeId,
    getViewReference: () => ({ viewPlaneNormal }),
    getSliceIndex: () => 0,
    render: jest.fn(),
  };

  mockViewports.set(id, viewport);

  return viewport;
}

/** Resolves after the next animation frame. */
function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

const mockLogger = utilities.logger.toolsLog.getLogger() as unknown as {
  warn: jest.Mock;
};

describe('contourCuts', () => {
  const polySeg = getPolySeg();

  beforeEach(() => {
    jest.clearAllMocks();
    (polySeg.clipAndCacheSurfacesForViewport as jest.Mock).mockImplementation(
      async () => new Map()
    );
    (polySeg.extractContourData as jest.Mock).mockImplementation(
      () =>
        new Map([
          [1, [{ points: [], lines: [], numberOfCells: 1, sliceIndex: 0 }]],
        ])
    );
    (polySeg.computeSurfaceData as jest.Mock).mockImplementation(
      async (segmentationId, { segmentIndices: [segmentIndex] }) => ({
        geometryIds: new Map([
          [segmentIndex, `${segmentationId}-surface-${segmentIndex}`],
        ]),
      })
    );
    (
      polySeg.createAndAddContourSegmentationsFromClippedSurfaces as jest.Mock
    ).mockImplementation(
      (_contours, viewport) => new Map([[1, new Set([`cut-${viewport.id}`])]])
    );
  });

  it('cuts only the segments whose contours do not lie in the plane of the viewport', async () => {
    addSegmentation('planes', { 1: [AXIAL, AXIAL], 2: [SAGITTAL] });

    await updateContourCuts(
      addViewport('planesSagittal', SAGITTAL) as never,
      'planes'
    );

    expect(polySeg.computeSurfaceData).toHaveBeenCalledTimes(1);
    expect(
      (polySeg.computeSurfaceData as jest.Mock).mock.calls[0][1].segmentIndices
    ).toEqual([1]);
    expect(
      (polySeg.clipAndCacheSurfacesForViewport as jest.Mock).mock.calls[0][0]
    ).toEqual([
      {
        id: 'planes-surface-1',
        points: [0, 0, 0],
        polys: [1, 0],
        segmentIndex: 1,
      },
    ]);
  });

  it('shares one cut between the viewports of one plane, and converts each segment once for all planes', async () => {
    addSegmentation('shared', { 1: [AXIAL] });

    await updateContourCuts(
      addViewport('sharedSagittal1', SAGITTAL) as never,
      'shared'
    );
    await updateContourCuts(
      addViewport('sharedSagittal2', SAGITTAL) as never,
      'shared'
    );
    await updateContourCuts(
      addViewport('sharedCoronal', CORONAL) as never,
      'shared'
    );

    expect(polySeg.computeSurfaceData).toHaveBeenCalledTimes(1);
    expect(polySeg.clipAndCacheSurfacesForViewport).toHaveBeenCalledTimes(2);
  });

  it('takes the cut away when the last viewport of its plane leaves it', async () => {
    addSegmentation('leave', { 1: [AXIAL] });
    await updateContourCuts(
      addViewport('leaveSagittal1', SAGITTAL) as never,
      'leave'
    );
    await updateContourCuts(
      addViewport('leaveSagittal2', SAGITTAL) as never,
      'leave'
    );

    removeContourCuts('leaveSagittal1', 'leave');
    expect(removeAnnotation).not.toHaveBeenCalled();

    removeContourCuts('leaveSagittal2', 'leave');
    expect(removeAnnotation).toHaveBeenCalledWith('cut-leaveSagittal1');
  });

  it('converts again after a change of the contours, and leaves the cut of the old contours', async () => {
    addSegmentation('modified', { 1: [AXIAL] });
    const viewport = addViewport('modifiedSagittal', SAGITTAL);

    await updateContourCuts(viewport as never, 'modified');
    updateContourCutsOfModifiedSegmentation('modified');
    mockGeometries.set('modified-surface-1', {
      data: { points: [1, 1, 1], polys: [1, 0] },
    });
    await updateContourCuts(viewport as never, 'modified');

    expect(polySeg.computeSurfaceData).toHaveBeenCalledTimes(2);
    expect(removeAnnotation).toHaveBeenCalledWith('cut-modifiedSagittal');
  });

  it('keeps the surfaces when the segmentation state gives a new object for the segmentation, as it does at every change', async () => {
    addSegmentation('cloned', { 1: [AXIAL] });

    await updateContourCuts(
      addViewport('clonedSagittal', SAGITTAL) as never,
      'cloned'
    );
    mockSegmentations.set(
      'cloned',
      structuredClone(mockSegmentations.get('cloned'))
    );
    await updateContourCuts(
      addViewport('clonedCoronal', CORONAL) as never,
      'cloned'
    );

    expect(polySeg.computeSurfaceData).toHaveBeenCalledTimes(1);
    expect(polySeg.clipAndCacheSurfacesForViewport).toHaveBeenCalledTimes(2);
  });

  it('converts a change of the contours after the conversion of the old ones that is still running, and takes the old surface out of the cache', async () => {
    addSegmentation('racing', { 1: [AXIAL] });
    const finishes = [];
    const started = [];

    (polySeg.computeSurfaceData as jest.Mock).mockImplementation(
      (segmentationId, { segmentIndices: [segmentIndex] }) => {
        const geometryId = `${segmentationId}-surface-${segmentIndex}`;

        started.push(geometryId);
        return new Promise((resolve) =>
          finishes.push((points) => {
            if (!mockGeometries.has(geometryId)) {
              mockGeometries.set(geometryId, {
                data: { points, polys: [1, 0] },
              });
            }
            resolve({ geometryIds: new Map([[segmentIndex, geometryId]]) });
          })
        );
      }
    );
    mockGeometries.delete('racing-surface-1');

    const sagittal = addViewport('racingSagittal', SAGITTAL);
    const oldCut = updateContourCuts(sagittal as never, 'racing');

    await Promise.resolve();
    updateContourCutsOfModifiedSegmentation('racing');
    const coronal = addViewport('racingCoronal', CORONAL);
    const newCut = updateContourCuts(coronal as never, 'racing');

    await new Promise((resolve) => setTimeout(resolve));
    expect(started.length).toBe(1);

    finishes[0]([0, 0, 0]);
    await oldCut;
    await new Promise((resolve) => setTimeout(resolve));
    expect(started.length).toBe(2);
    expect(mockGeometries.has('racing-surface-1')).toBe(false);

    finishes[1]([2, 2, 2]);
    await newCut;

    const clipped = (polySeg.clipAndCacheSurfacesForViewport as jest.Mock).mock
      .calls;
    expect(clipped.length).toBe(1);
    expect(clipped[0][0][0].points).toEqual([2, 2, 2]);
  });

  it('cuts each surface as soon as it is made, only the new ones, and adds the contours of its segment to the slice on display without taking the others away', async () => {
    addSegmentation('each', { 1: [AXIAL], 2: [AXIAL] });
    const answers = new Map();

    (polySeg.computeSurfaceData as jest.Mock).mockImplementation(
      (segmentationId, { segmentIndices: [segmentIndex] }) =>
        new Promise((resolve) =>
          answers.set(segmentIndex, () =>
            resolve({
              geometryIds: new Map([
                [segmentIndex, `${segmentationId}-surface-${segmentIndex}`],
              ]),
            })
          )
        )
    );
    (polySeg.clipAndCacheSurfacesForViewport as jest.Mock).mockImplementation(
      async (surfaces) =>
        new Map(surfaces.map(({ segmentIndex }) => [segmentIndex, true]))
    );
    (polySeg.extractContourData as jest.Mock).mockImplementation(
      (clipped) =>
        new Map(
          [...clipped.keys()].map((segmentIndex) => [
            segmentIndex,
            [{ points: [], lines: [], numberOfCells: 1, sliceIndex: 0 }],
          ])
        )
    );
    (
      polySeg.createAndAddContourSegmentationsFromClippedSurfaces as jest.Mock
    ).mockImplementation(
      (contours, viewport) =>
        new Map(
          [...contours.keys()].map((segmentIndex) => [
            segmentIndex,
            new Set([`cut-${viewport.id}-${segmentIndex}`]),
          ])
        )
    );
    const settle = () => new Promise((resolve) => setTimeout(resolve));

    const cut = updateContourCuts(
      addViewport('eachSagittal', SAGITTAL) as never,
      'each'
    );
    await settle();
    answers.get(2)();
    await settle();

    const clip = polySeg.clipAndCacheSurfacesForViewport as jest.Mock;
    const add =
      polySeg.createAndAddContourSegmentationsFromClippedSurfaces as jest.Mock;

    expect(
      clip.mock.calls.map(([surfaces]) =>
        surfaces.map((surface) => surface.segmentIndex)
      )
    ).toEqual([[2]]);
    expect(add.mock.calls.map(([contours]) => [...contours.keys()])).toEqual([
      [2],
    ]);

    answers.get(1)();
    await cut;

    expect(
      clip.mock.calls.map(([surfaces]) =>
        surfaces.map((surface) => surface.segmentIndex)
      )
    ).toEqual([[2], [1]]);
    expect(add.mock.calls.map(([contours]) => [...contours.keys()])).toEqual([
      [2],
      [1],
    ]);
    expect(removeAnnotation).not.toHaveBeenCalled();
  });

  it('converts first the segments whose contours reach the slice on display, and in each group the ones with fewer points first', async () => {
    const polylines = {
      1: [
        [5, 0, 0],
        [10, 0, 0],
        [7, 3, 0],
      ],
      2: Array.from({ length: 30 }, (_, i) => [
        Math.cos(i) - 0.5,
        Math.sin(i),
        0,
      ]),
      3: [
        [-2, 0, 0],
        [2, 0, 0],
        [0, 2, 0],
        [0, -2, 0],
        [1, 1, 0],
        [-1, 1, 0],
      ],
    };
    const annotationUIDsMap = new Map();

    Object.entries(polylines).forEach(([segmentIndex, polyline]) => {
      mockAnnotations.set(`order-${segmentIndex}`, {
        metadata: { viewPlaneNormal: AXIAL },
        data: { contour: { polyline } },
      });
      annotationUIDsMap.set(
        Number(segmentIndex),
        new Set([`order-${segmentIndex}`])
      );
    });
    mockSegmentations.set('order', {
      segmentationId: 'order',
      representationData: {
        Contour: { geometryIds: ['geometry'], annotationUIDsMap },
      },
    });
    const viewport = {
      ...addViewport('orderSagittal', SAGITTAL),
      getViewReference: () => ({
        viewPlaneNormal: SAGITTAL,
        cameraFocalPoint: [0, 0, 0],
      }),
    };
    mockViewports.set(viewport.id, viewport);

    await updateContourCuts(viewport as never, 'order');

    expect(
      (polySeg.computeSurfaceData as jest.Mock).mock.calls.map(
        ([, { segmentIndices }]) => segmentIndices[0]
      )
    ).toEqual([3, 2, 1]);
  });

  it('reports a segment with contours on planes that are not parallel once, and does not convert it', async () => {
    addSegmentation('mixed', { 1: [AXIAL, CORONAL] });

    await updateContourCuts(
      addViewport('mixedSagittal', SAGITTAL) as never,
      'mixed'
    );
    await updateContourCuts(
      addViewport('mixedCoronal', CORONAL) as never,
      'mixed'
    );

    expect(polySeg.computeSurfaceData).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn.mock.calls[0][0]).toContain('mixed, segment 1');
    expect(mockLogger.warn.mock.calls[0][0]).toContain('not parallel');
  });

  it('reports a conversion that gives no surface once, by the segmentation and the segment', async () => {
    addSegmentation('empty', { 3: [AXIAL] });
    (polySeg.computeSurfaceData as jest.Mock).mockResolvedValue({
      geometryIds: new Map(),
    });

    await updateContourCuts(
      addViewport('emptySagittal', SAGITTAL) as never,
      'empty'
    );
    await updateContourCuts(
      addViewport('emptyCoronal', CORONAL) as never,
      'empty'
    );

    expect(polySeg.computeSurfaceData).toHaveBeenCalledTimes(1);
    expect(polySeg.clipAndCacheSurfacesForViewport).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn.mock.calls[0][0]).toContain('empty, segment 3');
    expect(mockLogger.warn.mock.calls[0][0]).toContain('gave no surface');
  });

  it('reports once that the PolySeg add-on is missing, and cuts nothing', async () => {
    addSegmentation('noPolySeg', { 1: [AXIAL] });
    (getAddOns as jest.Mock).mockReturnValue({});

    await updateContourCuts(
      addViewport('noPolySegSagittal', SAGITTAL) as never,
      'noPolySeg'
    );
    await updateContourCuts(
      addViewport('noPolySegCoronal', CORONAL) as never,
      'noPolySeg'
    );

    expect(polySeg.computeSurfaceData).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn.mock.calls[0][0]).toContain(
      'init({ addons: { polySeg } })'
    );
  });

  it('cuts nothing on a 3D viewport and does not listen to it', async () => {
    addSegmentation('threeD', { 1: [AXIAL] });
    const viewport = { ...addViewport('threeD', SAGITTAL), type: 'volume3d' };

    await updateContourCuts(viewport as never, 'threeD');

    expect(polySeg.computeSurfaceData).not.toHaveBeenCalled();
    expect(viewport.element.addEventListener).not.toHaveBeenCalled();
  });

  describe('the state and the end of the cuts', () => {
    beforeEach(() => {
      (getAddOns as jest.Mock).mockReturnValue({ polySeg });
    });

    /** The details of the events fired for a viewport. */
    const eventsOf = (viewportId) =>
      mockTriggerEvent.mock.calls
        .map((call) => call[2])
        .filter((detail) => detail.viewportId === viewportId);

    it('gives the state pending until the cut of the plane is finished, and fires the event once at the next frame', async () => {
      addSegmentation('state', { 1: [AXIAL], 2: [AXIAL] });
      const viewport = addViewport('stateSagittal', SAGITTAL);

      expect(getViewportContourCutsState(viewport.id, 'state')).toBe('pending');

      const done = updateContourCuts(viewport as never, 'state');

      expect(getViewportContourCutsState(viewport.id, 'state')).toBe('pending');
      await done;
      expect(getViewportContourCutsState(viewport.id, 'state')).toBe(
        'complete'
      );
      expect(eventsOf(viewport.id)).toEqual([]);

      await nextFrame();
      await nextFrame();
      await updateContourCuts(viewport as never, 'state');
      await nextFrame();

      expect(eventsOf(viewport.id)).toEqual([
        {
          viewportId: 'stateSagittal',
          segmentationId: 'state',
          segmentIndices: [1, 2],
          failedSegmentIndices: [],
        },
      ]);
    });

    it('gives the state pending again after a change of the contours or of the plane, and fires again once the new cut is finished', async () => {
      addSegmentation('again', { 1: [AXIAL] });
      const viewport = addViewport('againSagittal', SAGITTAL);

      await updateContourCuts(viewport as never, 'again');
      await nextFrame();
      updateContourCutsOfModifiedSegmentation('again');

      expect(getViewportContourCutsState(viewport.id, 'again')).toBe('pending');

      await updateContourCuts(viewport as never, 'again');
      await nextFrame();

      viewport.getViewReference = () => ({ viewPlaneNormal: CORONAL });

      expect(getViewportContourCutsState(viewport.id, 'again')).toBe('pending');

      await updateContourCuts(viewport as never, 'again');
      await nextFrame();

      expect(getViewportContourCutsState(viewport.id, 'again')).toBe(
        'complete'
      );
      expect(eventsOf(viewport.id).length).toBe(3);
    });

    it('fires no event for a cut that is no longer the one of the viewport when its frame comes', async () => {
      addSegmentation('stale', { 1: [AXIAL] });
      const viewport = addViewport('staleSagittal', SAGITTAL);

      await updateContourCuts(viewport as never, 'stale');
      updateContourCutsOfModifiedSegmentation('stale');
      await nextFrame();

      expect(eventsOf(viewport.id)).toEqual([]);
      expect(getViewportContourCutsState(viewport.id, 'stale')).toBe('pending');
    });

    it('counts a segment whose conversion gives no surface as failed', async () => {
      addSegmentation('failed', { 1: [AXIAL], 2: [AXIAL] });
      mockGeometries.delete('failed-surface-2');

      await updateContourCuts(
        addViewport('failedSagittal', SAGITTAL) as never,
        'failed'
      );
      await nextFrame();

      expect(eventsOf('failedSagittal')).toEqual([
        {
          viewportId: 'failedSagittal',
          segmentationId: 'failed',
          segmentIndices: [1],
          failedSegmentIndices: [2],
        },
      ]);
    });
  });
});
