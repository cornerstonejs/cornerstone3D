import {
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

jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getGeometry: (geometryId) => mockGeometries.get(geometryId),
    removeGeometryLoadObject: (geometryId) => mockGeometries.delete(geometryId),
  },
  CONSTANTS: { EPSILON: 1e-3 },
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

const mockLogger = utilities.logger.toolsLog.getLogger() as unknown as {
  warn: jest.Mock;
};

describe('contourCuts', () => {
  const polySeg = getPolySeg();

  beforeEach(() => {
    jest.clearAllMocks();
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
});
