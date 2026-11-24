import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  worldOfVoxel,
} from '../../core/test/utils/planarSeriesBothModes';

const { Enums, utilities, geometryLoader } = cornerstone3D;
const { OrientationAxis } = Enums;
const { segmentation, ToolGroupManager, annotation } = csTools3d;
const { SegmentationRepresentations } = csTools3d.Enums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'contourPlaneOfPointsNext';

/** The slices of the series that hold an axial contour. */
const AXIAL_SLICES = [1, 2, 3, 4, 5, 6];

/** The column of the series that holds the sagittal contour. */
const SAGITTAL_COLUMN = 10;

async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until the contour annotations are made and drawn. */
async function settle() {
  await frames(6);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await frames(3);
}

/**
 * A contour set of closed rectangles on the slices `AXIAL_SLICES` of the
 * series, as the contours of an RTSTRUCT of an axial CT, one closed
 * rectangle across the slices at the column `SAGITTAL_COLUMN`, and one
 * rectangle in a plane that leans from slice 2 to slice 4 across the
 * columns. The axial rectangles run one way round and the others the other
 * way.
 */
function contourSetOf(series) {
  const axial = AXIAL_SLICES.map((k) => ({
    points: [
      worldOfVoxel(series, [8, 6, k]),
      worldOfVoxel(series, [20, 6, k]),
      worldOfVoxel(series, [20, 16, k]),
      worldOfVoxel(series, [8, 16, k]),
    ],
    type: Enums.ContourType.CLOSED_PLANAR,
    color: [255, 0, 0],
    segmentIndex: 1,
  }));
  const sagittal = {
    points: [
      worldOfVoxel(series, [SAGITTAL_COLUMN, 4, 1]),
      worldOfVoxel(series, [SAGITTAL_COLUMN, 4, 6]),
      worldOfVoxel(series, [SAGITTAL_COLUMN, 16, 6]),
      worldOfVoxel(series, [SAGITTAL_COLUMN, 16, 1]),
    ],
    type: Enums.ContourType.CLOSED_PLANAR,
    color: [255, 0, 0],
    segmentIndex: 1,
  };

  const oblique = {
    points: [
      worldOfVoxel(series, [8, 6, 2]),
      worldOfVoxel(series, [20, 6, 4]),
      worldOfVoxel(series, [20, 16, 4]),
      worldOfVoxel(series, [8, 16, 2]),
    ],
    type: Enums.ContourType.CLOSED_PLANAR,
    color: [255, 0, 0],
    segmentIndex: 1,
  };

  return {
    id: 'contourPlaneOfPointsSet',
    data: [...axial, sagittal, oblique],
    frameOfReferenceUID: 'bothModesFrame',
    segmentIndex: 1,
  };
}

/** Shows the volume of the series on a planar viewport in an orientation. */
async function showVolumeIn(viewport, series, orientation) {
  const displaySetId = `volume:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({ displaySetId, options: { orientation } });
  await renderAndWait(viewport);
}

/** The contour annotations of the segmentation, the axial ones first. */
function contourAnnotations() {
  return annotation.state
    .getAllAnnotations()
    .filter(
      (item) =>
        item.metadata.toolName === 'PlanarFreehandContourSegmentationTool'
    );
}

function expectNormal(actual, expected, context) {
  expected.forEach((value, axis) => {
    expect(actual[axis]).withContext(context).toBeCloseTo(value, 6);
  });
}

describe('The contour annotations of a contour set on direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    csTools3d.init();
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    }).renderingEngine;
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  [
    ['sagittal', 'axial', 'coronal'],
    ['axial', 'sagittal', 'coronal'],
    ['coronal', 'sagittal', 'axial'],
  ].forEach((order) => {
    it(`take the plane of their own points when the representation goes to the ${order.join(', ')} panes in that order`, async function () {
      const series = await createSeries({ id: `contourPlane${order[0]}` });
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
      const orientations = {
        axial: OrientationAxis.AXIAL,
        sagittal: OrientationAxis.SAGITTAL,
        coronal: OrientationAxis.CORONAL,
      };
      const panes = {};

      for (const [name, orientation] of Object.entries(orientations)) {
        panes[name] = createNextViewport(
          renderingEngine,
          `contourPlane-${name}`
        );
        toolGroup.addViewport(panes[name].id, renderingEngineId);
        await showVolumeIn(panes[name], series, orientation);
      }
      await frames(3);

      const geometryId = `contourPlaneGeometry${order[0]}`;
      const segmentationId = `contourPlaneSegmentation${order[0]}`;

      geometryLoader.createAndCacheGeometry(geometryId, {
        type: Enums.GeometryType.CONTOUR,
        geometryData: contourSetOf(series),
      });
      segmentation.addSegmentations([
        {
          segmentationId,
          representation: {
            type: SegmentationRepresentations.Contour,
            data: { geometryIds: [geometryId] },
          },
        },
      ]);
      order.forEach((name) => {
        segmentation.addSegmentationRepresentations(panes[name].id, [
          { segmentationId, type: SegmentationRepresentations.Contour },
        ]);
      });
      await settle();

      const contours = contourAnnotations();
      const inPlaneOfAxis = (axis) => (item) =>
        item.data.contour.polyline.every(
          (point) => point[axis] === item.data.contour.polyline[0][axis]
        );
      const axialContours = contours.filter(inPlaneOfAxis(2));
      const sagittalContours = contours.filter(inPlaneOfAxis(0));
      const obliqueContours = contours.filter(
        (item) =>
          !axialContours.includes(item) && !sagittalContours.includes(item)
      );

      expect(axialContours.length).toBe(AXIAL_SLICES.length);
      expect(sagittalContours.length).toBe(1);
      expect(obliqueContours.length).toBe(1);
      contours.forEach((item) => {
        expect(Array.isArray(item.metadata.viewPlaneNormal))
          .withContext('a plain array')
          .toBe(true);
      });

      const [first, second, , fourth] =
        obliqueContours[0].data.contour.polyline;
      const obliqueNormal = obliqueContours[0].metadata.viewPlaneNormal;
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const along = (a, b) => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];

      expect(dot(obliqueNormal, obliqueNormal)).toBeCloseTo(1, 6);
      expect(dot(obliqueNormal, along(first, second))).toBeCloseTo(0, 4);
      expect(dot(obliqueNormal, along(first, fourth))).toBeCloseTo(0, 4);
      expect(dot(obliqueNormal, [0, 0, -1])).toBeGreaterThan(0.9);
      axialContours.forEach((item) => {
        const slice = series.imageIds.indexOf(item.metadata.referencedImageId);
        const z = worldOfVoxel(series, [0, 0, slice])[2];

        expectNormal(item.metadata.viewPlaneNormal, [0, 0, -1], 'axial');
        expect(item.data.contour.polyline[0][2]).withContext('slice').toBe(z);
      });
      expectNormal(
        sagittalContours[0].metadata.viewPlaneNormal,
        [1, 0, 0],
        'sagittal'
      );

      const { filterAnnotationsForDisplay } = csTools3d.utilities.planar;
      const axialShown = filterAnnotationsForDisplay(panes.axial, contours);

      expect(axialShown.length).toBe(1);
      expect(axialShown[0].metadata.referencedImageId).toBe(
        panes.axial.getCurrentImageId()
      );

      panes.sagittal.setViewState({
        slice: {
          kind: 'volumePoint',
          sliceWorldPoint: worldOfVoxel(series, [SAGITTAL_COLUMN, 12, 4]),
        },
      });
      await renderAndWait(panes.sagittal);

      expect(filterAnnotationsForDisplay(panes.sagittal, contours)).toEqual(
        sagittalContours
      );
      expect(filterAnnotationsForDisplay(panes.coronal, contours)).toEqual([]);
    });
  });
});
