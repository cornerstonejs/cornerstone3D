import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const {
  cache,
  RenderingEngine,
  utilities,
  metaData,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  imageLoader,
} = cornerstone3D;

const { Events, ViewportType } = Enums;
const { createAndCacheVolume } = volumeLoader;

const {
  StackScrollTool,
  ToolGroupManager,
  synchronizers,
  SynchronizerManager,
  Enums: csToolsEnums,
} = csTools3d;

const { MouseBindings } = csToolsEnums;
const { createImageSliceSynchronizer } = synchronizers;

const renderingEngineId = utilities.uuidv4();
const viewportId1 = 'VIEWPORT1';
const viewportId2 = 'VIEWPORT2';

// Volume IDs - same Frame of Reference
const volumeId1 = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  id: 'volume1',
  rows: 100,
  columns: 100,
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
});

const volumeId2 = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  id: 'volume2',
  rows: 100,
  columns: 100,
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
});

// Helper to create stack imageIds with specific sliceIndex for proper imagePositionPatient
function createStackImageIds(count, prefix = 'stack') {
  return Array.from({ length: count }, (_, i) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      id: `${prefix}_${i}`,
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: i, // This sets imagePositionPatient to [0, 0, i]
    })
  );
}

describe('Image Slice Synchronizer:', () => {
  let testEnv;
  let renderingEngine;
  let synchronizer;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['default'],
      tools: [StackScrollTool],
      toolActivations: {
        [StackScrollTool.toolName]: {
          bindings: [{ mouseButton: MouseBindings.Wheel }],
        },
      },
      viewportIds: [viewportId1, viewportId2],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    if (synchronizer) {
      SynchronizerManager.destroySynchronizer(synchronizer.id);
      synchronizer = null;
    }
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  // 1. Stack to Stack Synchronization
  describe('Stack to Stack Synchronization', () => {
    it('Should synchronize slice position between two stack viewports', function (done) {
      const [element1, element2] = testUtils.createViewports(renderingEngine, [
        {
          viewportType: ViewportType.STACK,
          viewportId: viewportId1,
          width: 256,
          height: 256,
        },
        {
          viewportType: ViewportType.STACK,
          viewportId: viewportId2,
          width: 256,
          height: 256,
        },
      ]);

      const imageIds1 = createStackImageIds(10, 'source');
      const imageIds2 = createStackImageIds(10, 'target');

      let renderedCount = 0;

      const initialRenderHandler = async () => {
        renderedCount++;
        if (renderedCount < 2) return;

        element1.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );
        element2.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );

        // Guard against race conditions during cleanup
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        if (!vp1 || !vp2) return;

        // Create and setup synchronizer
        synchronizer = createImageSliceSynchronizer('stackSliceSync');

        synchronizer.addSource({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId1,
        });
        synchronizer.addTarget({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId2,
        });

        // Use a promise to coordinate sync event with jumpToSlice completion
        const syncPromise = new Promise((resolve) => {
          element2.addEventListener(
            Events.STACK_NEW_IMAGE,
            function syncHandler() {
              element2.removeEventListener(Events.STACK_NEW_IMAGE, syncHandler);

              // Verify target viewport moved to same slice
              const targetIndex = vp2.getCurrentImageIdIndex();
              expect(targetIndex).toBe(5);
              resolve();
            }
          );
        });

        // Scroll source viewport to slice 5
        await utilities.jumpToSlice(element1, { imageIndex: 5 });

        // Wait for sync to complete, then finish test
        await syncPromise;
        done();
      };

      element1.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);
      element2.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);

      try {
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        Promise.all([
          vp1.setStack(imageIds1, 0),
          vp2.setStack(imageIds2, 0),
        ]).then(() => {
          renderingEngine.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  // ============================================================
  // 2. Volume to Volume Synchronization
  // ============================================================
  describe('Volume to Volume Synchronization', () => {
    it('Should synchronize slice position between two volume viewports', function (done) {
      const [element1, element2] = testUtils.createViewports(renderingEngine, [
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          orientation: Enums.OrientationAxis.AXIAL,
          viewportId: viewportId1,
          width: 256,
          height: 256,
        },
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          orientation: Enums.OrientationAxis.AXIAL,
          viewportId: viewportId2,
          width: 256,
          height: 256,
        },
      ]);

      let renderedCount = 0;

      const initialRenderHandler = async () => {
        renderedCount++;
        if (renderedCount < 2) return;

        element1.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );
        element2.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );

        // Guard against race conditions during cleanup
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        if (!vp1 || !vp2) return;

        // Create and setup synchronizer
        synchronizer = createImageSliceSynchronizer('volumeSliceSync');

        synchronizer.addSource({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId1,
        });
        synchronizer.addTarget({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId2,
        });

        // Use a promise to coordinate sync event with jumpToSlice completion
        const syncPromise = new Promise((resolve) => {
          element2.addEventListener(
            Events.VOLUME_NEW_IMAGE,
            function syncHandler() {
              element2.removeEventListener(
                Events.VOLUME_NEW_IMAGE,
                syncHandler
              );

              // Verify target viewport moved to approximately same position
              const sourceIndex = vp1.getCurrentImageIdIndex();
              const targetIndex = vp2.getCurrentImageIdIndex();
              expect(targetIndex).toBe(sourceIndex);
              resolve();
            }
          );
        });

        // Scroll source viewport to slice 2 (volumes start at middle ~4-5)
        await utilities.jumpToSlice(element1, { imageIndex: 2 });

        // Wait for sync to complete, then finish test
        await syncPromise;
        done();
      };

      element1.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);
      element2.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);

      try {
        Promise.all([
          createAndCacheVolume(volumeId1, { imageIds: [] }),
          createAndCacheVolume(volumeId2, { imageIds: [] }),
        ]).then(() => {
          setVolumesForViewports(
            renderingEngine,
            [{ volumeId: volumeId1 }],
            [viewportId1]
          );
          setVolumesForViewports(
            renderingEngine,
            [{ volumeId: volumeId2 }],
            [viewportId2]
          );
          renderingEngine.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  // 3. Volume to Stack Synchronization
  describe('Volume to Stack Synchronization', () => {
    it('Should synchronize from volume viewport to stack viewport', function (done) {
      const [element1, element2] = testUtils.createViewports(renderingEngine, [
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          orientation: Enums.OrientationAxis.AXIAL,
          viewportId: viewportId1,
          width: 256,
          height: 256,
        },
        {
          viewportType: ViewportType.STACK,
          viewportId: viewportId2,
          width: 256,
          height: 256,
        },
      ]);

      const stackImageIds = createStackImageIds(10, 'target');

      let renderedCount = 0;

      const initialRenderHandler = async () => {
        renderedCount++;
        if (renderedCount < 2) return;

        element1.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );
        element2.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );

        // Guard against race conditions during cleanup
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        if (!vp1 || !vp2) return;

        // Create and setup synchronizer
        synchronizer = createImageSliceSynchronizer('volumeToStackSync');

        synchronizer.addSource({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId1,
        });
        synchronizer.addTarget({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId2,
        });

        // Use a promise to coordinate sync event with jumpToSlice completion
        const syncPromise = new Promise((resolve) => {
          element2.addEventListener(
            Events.STACK_NEW_IMAGE,
            function syncHandler() {
              element2.removeEventListener(Events.STACK_NEW_IMAGE, syncHandler);

              // Verify target stack viewport moved to closest slice
              const targetIndex = vp2.getCurrentImageIdIndex();
              // Should be close to 2 based on imagePositionPatient matching
              expect(targetIndex).toBeGreaterThanOrEqual(1);
              expect(targetIndex).toBeLessThanOrEqual(3);
              resolve();
            }
          );
        });

        // Scroll source volume viewport to slice 2
        await utilities.jumpToSlice(element1, { imageIndex: 2 });

        // Wait for sync to complete, then finish test
        await syncPromise;
        done();
      };

      element1.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);
      element2.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);

      try {
        const vp2 = renderingEngine.getViewport(viewportId2);

        createAndCacheVolume(volumeId1, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            renderingEngine,
            [{ volumeId: volumeId1 }],
            [viewportId1]
          );

          vp2.setStack(stackImageIds, 0).then(() => {
            renderingEngine.render();
          });
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  // 4. Stack to Volume Synchronization
  describe('Stack to Volume Synchronization', () => {
    it('Should synchronize from stack viewport to volume viewport', function (done) {
      const [element1, element2] = testUtils.createViewports(renderingEngine, [
        {
          viewportType: ViewportType.STACK,
          viewportId: viewportId1,
          width: 256,
          height: 256,
        },
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          orientation: Enums.OrientationAxis.AXIAL,
          viewportId: viewportId2,
          width: 256,
          height: 256,
        },
      ]);

      const stackImageIds = createStackImageIds(10, 'source');

      let renderedCount = 0;

      const initialRenderHandler = async () => {
        renderedCount++;
        if (renderedCount < 2) return;

        element1.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );
        element2.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );

        // Guard against race conditions during cleanup
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        if (!vp1 || !vp2) return;

        // Create and setup synchronizer
        synchronizer = createImageSliceSynchronizer('stackToVolumeSync');

        synchronizer.addSource({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId1,
        });
        synchronizer.addTarget({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId2,
        });

        const initialVolumeIndex = vp2.getCurrentImageIdIndex();

        // Use a promise to coordinate sync event with jumpToSlice completion
        const syncPromise = new Promise((resolve) => {
          element2.addEventListener(
            Events.VOLUME_NEW_IMAGE,
            function syncHandler() {
              element2.removeEventListener(
                Events.VOLUME_NEW_IMAGE,
                syncHandler
              );

              // Verify target volume viewport moved
              const targetIndex = vp2.getCurrentImageIdIndex();
              expect(targetIndex).not.toBe(initialVolumeIndex);
              resolve();
            }
          );
        });

        // Scroll source stack viewport to slice 2 (not 5, since volume starts at z=5)
        await utilities.jumpToSlice(element1, { imageIndex: 2 });

        // Wait for sync to complete, then finish test
        await syncPromise;
        done();
      };

      element1.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);
      element2.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);

      try {
        const vp1 = renderingEngine.getViewport(viewportId1);

        createAndCacheVolume(volumeId1, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            renderingEngine,
            [{ volumeId: volumeId1 }],
            [viewportId2]
          );

          vp1.setStack(stackImageIds, 0).then(() => {
            renderingEngine.render();
          });
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  // Synchronizer Options Tests
  describe('Synchronizer Options', () => {
    it('Should not sync when target viewport has disabled option', function (done) {
      const [element1, element2] = testUtils.createViewports(renderingEngine, [
        {
          viewportType: ViewportType.STACK,
          viewportId: viewportId1,
          width: 256,
          height: 256,
        },
        {
          viewportType: ViewportType.STACK,
          viewportId: viewportId2,
          width: 256,
          height: 256,
        },
      ]);

      const imageIds1 = createStackImageIds(10, 'source');
      const imageIds2 = createStackImageIds(10, 'target');

      let renderedCount = 0;

      const initialRenderHandler = async () => {
        renderedCount++;
        if (renderedCount < 2) return;

        element1.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );
        element2.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );

        // Guard against race conditions during cleanup
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        if (!vp1 || !vp2) return;

        // Create synchronizer with disabled option for target
        synchronizer = createImageSliceSynchronizer('disabledSync');

        synchronizer.addSource({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId1,
        });
        synchronizer.addTarget({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId2,
        });

        // Disable sync for target viewport
        synchronizer.setOptions(viewportId2, { disabled: true });

        const initialIndex = vp2.getCurrentImageIdIndex();

        // Scroll source and wait a bit
        await utilities.jumpToSlice(element1, { imageIndex: 5 });

        // Give time for potential sync
        setTimeout(() => {
          // Target should NOT have moved since it's disabled
          const currentIndex = vp2.getCurrentImageIdIndex();
          expect(currentIndex).toBe(initialIndex);
          done();
        }, 500);
      };

      element1.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);
      element2.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);

      try {
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        Promise.all([
          vp1.setStack(imageIds1, 0),
          vp2.setStack(imageIds2, 0),
        ]).then(() => {
          renderingEngine.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should work with bidirectional sync using add() method', function (done) {
      const [element1, element2] = testUtils.createViewports(renderingEngine, [
        {
          viewportType: ViewportType.STACK,
          viewportId: viewportId1,
          width: 256,
          height: 256,
        },
        {
          viewportType: ViewportType.STACK,
          viewportId: viewportId2,
          width: 256,
          height: 256,
        },
      ]);

      const imageIds1 = createStackImageIds(10, 'vp1');
      const imageIds2 = createStackImageIds(10, 'vp2');

      let renderedCount = 0;

      const initialRenderHandler = async () => {
        renderedCount++;
        if (renderedCount < 2) return;

        element1.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );
        element2.removeEventListener(
          Events.IMAGE_RENDERED,
          initialRenderHandler
        );

        // Guard against race conditions during cleanup
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        if (!vp1 || !vp2) return;

        // Create synchronizer with bidirectional sync using add()
        synchronizer = createImageSliceSynchronizer('bidirectionalSync');

        // Using add() makes both viewports source and target
        synchronizer.add({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId1,
        });
        synchronizer.add({
          renderingEngineId: renderingEngine.id,
          viewportId: viewportId2,
        });

        // Use a promise to coordinate sync event with jumpToSlice completion
        const syncPromise = new Promise((resolve) => {
          element2.addEventListener(
            Events.STACK_NEW_IMAGE,
            function syncHandler() {
              element2.removeEventListener(Events.STACK_NEW_IMAGE, syncHandler);

              const targetIndex = vp2.getCurrentImageIdIndex();
              expect(targetIndex).toBe(5);
              resolve();
            }
          );
        });

        // Scroll viewport 1
        await utilities.jumpToSlice(element1, { imageIndex: 5 });

        // Wait for sync to complete, then finish test
        await syncPromise;
        done();
      };

      element1.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);
      element2.addEventListener(Events.IMAGE_RENDERED, initialRenderHandler);

      try {
        const vp1 = renderingEngine.getViewport(viewportId1);
        const vp2 = renderingEngine.getViewport(viewportId2);
        Promise.all([
          vp1.setStack(imageIds1, 0),
          vp2.setStack(imageIds2, 0),
        ]).then(() => {
          renderingEngine.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
