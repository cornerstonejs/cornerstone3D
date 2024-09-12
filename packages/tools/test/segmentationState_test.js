import * as cornerstone3D from '@cornerstonejs/core';
import * as testUtils from '../../../utils/test/testUtils';
import * as csTools3d from '../src/index';

const {
  cache,
  RenderingEngine,
  Enums,
  metaData,
  volumeLoader,
  setVolumesForViewports,
  eventTarget,
} = cornerstone3D;

const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const { ViewportType } = Enums;

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  utilities: { segmentation: segUtils },
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;
const { SegmentationRepresentations } = csToolsEnums;

const { fakeMetaDataProvider, fakeVolumeLoader } = testUtils;

const renderingEngineId = 'renderingEngineId-segmentationState_test';
const toolGroupId = 'toolGroupId-segmentationState_test';

const viewportId = 'VIEWPORT';

const Labelmap = SegmentationRepresentations.Labelmap;

describe('Segmentation State:', () => {
  let testEnv;
  let renderingEngine;
  let segToolGroup;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      viewportIds: [viewportId],
    });

    renderingEngine = testEnv.renderingEngine;
    segToolGroup = testEnv.toolGroups[toolGroupId];
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      cleanupDOMElements: true,
    });
  });

  it('should successfully create a state when segmentation is added', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportId: viewportId,
    });

    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    const segVolumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    const vp = renderingEngine.getViewport(viewportId);

    eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
      const globalState = segmentation.state.getSegmentation(segVolumeId);

      expect(evt.detail.segmentationId.includes(segVolumeId)).toBe(true);

      expect(globalState).toBeDefined();

      expect(globalState.segmentationId).toBe(segVolumeId);
      expect(globalState.activeSegmentIndex).toBe(1);
    });

    eventTarget.addEventListener(
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      (evt) => {
        const stateManager =
          segmentation.state.getDefaultSegmentationStateManager(segVolumeId);

        const state = stateManager.getState();

        expect(state).toBeDefined();
        expect(state.representations).toBeDefined();

        const toolGroupSegRepresentations =
          segmentation.state.getSegmentationRepresentations(viewportId);

        const segRepresentation = toolGroupSegRepresentations[0];

        expect(segRepresentation.segmentationId).toBe(segVolumeId);
        expect(segRepresentation.type).toBe(Labelmap);
        expect(segRepresentation.rendering).toBeDefined();
      }
    );

    eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
      done();
    });

    const callback = ({ volumeActor }) =>
      volumeActor.getProperty().setInterpolationTypeToNearest();

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId, callback }],
          [viewportId]
        );
        vp.render();
        createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
          addSegmentations([
            {
              segmentationId: segVolumeId,
              representation: {
                type: csToolsEnums.SegmentationRepresentations.Labelmap,
                data: {
                  volumeId: segVolumeId,
                },
              },
            },
          ]);

          addSegmentationRepresentations(viewportId, [
            {
              segmentationId: segVolumeId,
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
            },
          ]);
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('should successfully create a global default representation configuration', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportId: viewportId,
    });

    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    const segVolumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    const vp = renderingEngine.getViewport(viewportId);

    eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
      const globalConfig = segmentation.config.getGlobalConfig();

      expect(globalConfig.renderInactiveRepresentations).toBe(true);
      expect(globalConfig.representations).toBeDefined();
      expect(globalConfig.representations[Labelmap]).toBeDefined();
    });

    eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
      done();
    });

    const callback = ({ volumeActor }) =>
      volumeActor.getProperty().setInterpolationTypeToNearest();

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId, callback }],
          [viewportId]
        );
        vp.render();
        createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
          addSegmentations([
            {
              segmentationId: segVolumeId,
              representation: {
                type: csToolsEnums.SegmentationRepresentations.Labelmap,
                data: {
                  volumeId: segVolumeId,
                },
              },
            },
          ]);

          addSegmentationRepresentations(viewportId, [
            {
              segmentationId: segVolumeId,
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
            },
          ]);
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
