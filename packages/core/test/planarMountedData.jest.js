import { PlanarRenderModeId } from '../src/RenderingEngine/Viewports/Planar/planarRenderModeIds';
import PlanarMountedData from '../src/RenderingEngine/Viewports/Planar/PlanarMountedData';
import PlanarViewReferenceController from '../src/RenderingEngine/Viewports/Planar/PlanarViewReferenceController';
import BaseViewport from '../src/RenderingEngine/Viewports/BaseViewport';

function createBinding({
  actorUID,
  displaySetId,
  frameOfReferenceUID = 'for-1',
  imageIds = [`${displaySetId}-image`],
  role = 'overlay',
  volumeId,
} = {}) {
  return {
    data: {
      id: displaySetId,
      type: 'image',
      imageIds,
      initialImageIdIndex: 0,
      volumeId,
    },
    role,
    rendering: {
      currentImageIdIndex: 0,
      maxImageIdIndex: imageIds.length - 1,
      renderMode: PlanarRenderModeId.CANVAS_FRAME,
    },
    applyViewState: jest.fn(),
    getActorEntry: () => ({
      actor: {},
      referencedId: volumeId ?? displaySetId,
      uid: actorUID,
    }),
    getFrameOfReferenceUID: () => frameOfReferenceUID,
    removeData: jest.fn(),
    updateAppearance: jest.fn(),
  };
}

function createMountedData(bindings) {
  return new PlanarMountedData({
    getBinding: (displaySetId) => bindings.get(displaySetId),
    getFirstBinding: () => bindings.values().next().value,
    getBindings: () => bindings.entries(),
    removeDisplaySet: (displaySetId) => bindings.delete(displaySetId),
    promoteFirstDisplaySetToSource: () =>
      BaseViewport.prototype.promoteFirstDisplaySetToSource.call({ bindings }),
  });
}

describe('Planar mounted-data orchestration', () => {
  it('promotes one source and returns actors with source before overlays', () => {
    const bindings = new Map([
      [
        'source',
        createBinding({
          actorUID: 'source-actor',
          displaySetId: 'source',
          role: 'source',
        }),
      ],
      [
        'overlay',
        createBinding({
          actorUID: 'overlay-actor',
          displaySetId: 'overlay',
        }),
      ],
    ]);
    const mountedData = createMountedData(bindings);

    mountedData.promoteSourceDisplaySetId('overlay');

    expect(bindings.get('source').role).toBe('overlay');
    expect(bindings.get('overlay').role).toBe('source');
    expect(mountedData.getCurrentBinding().data.id).toBe('overlay');
    expect(mountedData.getActors().map((actor) => actor.uid)).toEqual([
      'overlay-actor',
      'source-actor',
    ]);
  });

  it('promotes the next binding when the active source is removed', () => {
    const bindings = new Map([
      [
        'source',
        createBinding({
          actorUID: 'source-actor',
          displaySetId: 'source',
          role: 'source',
        }),
      ],
      [
        'overlay',
        createBinding({
          actorUID: 'overlay-actor',
          displaySetId: 'overlay',
        }),
      ],
    ]);
    const mountedData = createMountedData(bindings);

    mountedData.promoteSourceDisplaySetId('source');
    bindings.delete('source');
    mountedData.handleRemovedData('source');

    expect(mountedData.getSourceDisplaySetId()).toBe('overlay');
    expect(bindings.get('overlay').role).toBe('source');
  });
});

describe('Planar view-reference orchestration', () => {
  it('keeps the source for a reference of an image of an overlay', () => {
    const bindings = new Map([
      [
        'source',
        createBinding({
          actorUID: 'source-actor',
          displaySetId: 'source',
          imageIds: ['image:source'],
          role: 'source',
        }),
      ],
      [
        'overlay',
        createBinding({
          actorUID: 'overlay-actor',
          displaySetId: 'overlay',
          imageIds: ['image:overlay'],
        }),
      ],
    ]);
    const mountedData = createMountedData(bindings);
    let viewState = {
      slice: {
        kind: 'stackIndex',
        imageIdIndex: 0,
      },
    };
    const setImageIdIndex = jest.fn((imageIdIndex) => {
      viewState = {
        ...viewState,
        slice: {
          kind: 'stackIndex',
          imageIdIndex,
        },
      };

      return Promise.resolve('image:overlay');
    });
    mountedData.promoteSourceDisplaySetId('source');

    const references = new PlanarViewReferenceController({
      viewportId: 'viewport-1',
      viewportType: 'planar',
      getSourceDisplaySetId: () => mountedData.getSourceDisplaySetId(),
      getBinding: (displaySetId) => bindings.get(displaySetId),
      getBindings: () => bindings.entries(),
      getCurrentBinding: () => mountedData.getCurrentBinding(),
      getRenderContext: () => ({
        viewportId: 'viewport-1',
        renderingEngineId: 'rendering-engine',
        type: 'planar',
        viewport: {
          element: document.createElement('div'),
          getSourceDisplaySetId: () => mountedData.getSourceDisplaySetId(),
          getOverlayActors: () =>
            mountedData.getProjectedActorEntries('overlay'),
          getViewState: () => viewState,
          isCurrentDisplaySetId: (displaySetId) =>
            mountedData.getCurrentBinding()?.data.id === displaySetId,
        },
        renderPath: {
          renderMode: PlanarRenderModeId.CANVAS_FRAME,
        },
        view: {},
        display: {
          activateRenderMode: jest.fn(),
          renderNow: jest.fn(),
          requestRender: jest.fn(),
        },
        cpu: {
          canvas: document.createElement('canvas'),
          composition: {
            clearedRenderPassId: -1,
            renderPassId: 0,
          },
          context: document.createElement('canvas').getContext('2d'),
        },
        vtk: {
          canvas: document.createElement('canvas'),
          renderer: {},
        },
      }),
      getResolvedView: () => ({
        getFrameOfReferenceUID: () => 'for-1',
        toICamera: () => ({
          focalPoint: [0, 0, 0],
          parallelProjection: true,
          parallelScale: 1,
          position: [0, 0, 1],
          viewPlaneNormal: [0, 0, 1],
          viewUp: [0, -1, 0],
        }),
      }),
      getViewState: () => viewState,
      getVolumeSliceWorldPointForImageIdIndex: (imageIdIndex) => [
        0,
        0,
        imageIdIndex,
      ],
      setImageIdIndex,
      setViewState: (viewStatePatch) => {
        viewState = {
          ...viewState,
          ...viewStatePatch,
        };
      },
    });

    references.setViewReference({
      FrameOfReferenceUID: 'for-1',
      referencedImageId: 'image:overlay',
    });

    expect(mountedData.getSourceDisplaySetId()).toBe('source');
    expect(bindings.get('overlay').role).toBe('overlay');
    expect(setImageIdIndex).not.toHaveBeenCalled();
  });
});
