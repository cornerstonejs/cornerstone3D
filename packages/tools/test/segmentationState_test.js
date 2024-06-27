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
  imageLoader,
  getEnabledElement,
} = cornerstone3D;

const { unregisterAllImageLoaders } = imageLoader;
const { registerVolumeLoader, createAndCacheEmptyVolume } = volumeLoader;
const { ViewportType } = Enums;

const {
  ToolGroupManager,

  Enums: csToolsEnums,
  segmentation,
  utilities: { segmentation: segUtils },
} = csTools3d;

const { Events } = csToolsEnums;

const { addRepresentations, addSegmentations } = segmentation;
const { SegmentationRepresentations } = csToolsEnums;

const { fakeMetaDataProvider, fakeVolumeLoader } = testUtils;

const renderingEngineId = 'renderingEngineId-segmentationState_test';
const toolGroupId = 'toolGroupId-segmentationState_test';

const viewportId = 'VIEWPORT';

const LABELMAP = SegmentationRepresentations.Labelmap;

function createViewport(renderingEngine, orientation) {
  const element = document.createElement('div');

  element.style.width = '250px';
  element.style.height = '250px';
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type: ViewportType.ORTHOGRAPHIC,
      element,
      defaultOptions: {
        orientation,
        background: [1, 0, 1], // pinkish background
      },
    },
  ]);
  return element;
}

describe('Segmentation State -- ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('State', function () {
    beforeEach(function () {
      csTools3d.init();
      cache.purgeCache();
      this.DOMElements = [];

      this.segToolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      this.renderingEngine = new RenderingEngine(renderingEngineId);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
      // Note: since on toolGroup destroy, all segmentations are removed
      // from the toolGroups, and that triggers a state_updated event, we
      // need to make sure we remove the listeners before we destroy the
      // toolGroup
      eventTarget.reset();
      csTools3d.destroy();
      cache.purgeCache();
      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      ToolGroupManager.destroyToolGroup(toolGroupId);
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should successfully create a global and toolGroup state when segmentation is added', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

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

          expect(evt.detail.toolGroupId).toBe(toolGroupId);
          expect(state).toBeDefined();
          expect(state.toolGroups).toBeDefined();

          const toolGroupSegmentationState =
            state.toolGroups[this.segToolGroup.id];

          expect(toolGroupSegmentationState).toBeDefined();
          expect(
            toolGroupSegmentationState.segmentationRepresentations.length
          ).toBe(1);

          const toolGroupSegRepresentations =
            segmentation.state.getSegmentationRepresentations(
              this.segToolGroup.id
            );

          expect(
            toolGroupSegmentationState.segmentationRepresentations
          ).toEqual(toolGroupSegRepresentations);

          const segRepresentation = toolGroupSegRepresentations[0];

          expect(segRepresentation.active).toBe(true);
          expect(segRepresentation.segmentationRepresentationUID).toBeDefined();
          expect(segRepresentation.segmentationId).toBe(segVolumeId);
          expect(segRepresentation.type).toBe(LABELMAP);
          expect(segRepresentation.config).toBeDefined();
        }
      );

      // wait for segmentation render to call done to ensure
      // all events have been fired and we don't get errors for rendering while
      // the data is decached
      eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
        done();
      });

      this.segToolGroup.addViewport(vp.id, this.renderingEngine.id);

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        createAndCacheEmptyVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId, callback }],
            [viewportId]
          );
          vp.render();
          createAndCacheEmptyVolume(segVolumeId, { imageIds: [] }).then(() => {
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

            addRepresentations(this.segToolGroup.id, [
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
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
        const globalConfig = segmentation.config.getGlobalConfig();

        expect(globalConfig.renderInactiveRepresentations).toBe(true);
        expect(globalConfig.representations).toBeDefined();
        expect(globalConfig.representations[LABELMAP]).toBeDefined();

        const representationConfig = segUtils.getDefaultRepresentationConfig({
          type: LABELMAP,
        });

        const stateConfig = globalConfig.representations[LABELMAP];

        expect(Object.keys(stateConfig)).toEqual(
          Object.keys(representationConfig)
        );

        expect(Object.values(stateConfig)).toEqual(
          Object.values(representationConfig)
        );
      });

      // wait for segmentation rendered event
      eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
        done();
      });

      this.segToolGroup.addViewport(vp.id, this.renderingEngine.id);

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        createAndCacheEmptyVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId, callback }],
            [viewportId]
          );
          vp.render();
          createAndCacheEmptyVolume(segVolumeId, { imageIds: [] }).then(() => {
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

            addRepresentations(this.segToolGroup.id, [
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
});
