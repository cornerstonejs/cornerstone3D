import { ActorRenderMode } from '../src/types';
import {
  PlanarMountedData,
  PlanarViewReferenceController,
} from '../src/RenderingEngine/ViewportNext/Planar';

function createBinding({
  actorUID,
  dataId,
  frameOfReferenceUID = 'for-1',
  imageIds = [`${dataId}-image`],
  role = 'overlay',
  volumeId,
} = {}) {
  return {
    data: {
      id: dataId,
      type: 'image',
      imageIds,
      initialImageIdIndex: 0,
      volumeId,
    },
    role,
    rendering: {
      currentImageIdIndex: 0,
      maxImageIdIndex: imageIds.length - 1,
      renderMode: ActorRenderMode.CPU_IMAGE,
    },
    applyViewState: jest.fn(),
    getActorEntry: () => ({
      actor: {},
      referencedId: volumeId ?? dataId,
      uid: actorUID,
    }),
    getFrameOfReferenceUID: () => frameOfReferenceUID,
    removeData: jest.fn(),
    updateDataPresentation: jest.fn(),
  };
}

function createMountedData(bindings) {
  return new PlanarMountedData({
    getBinding: (dataId) => bindings.get(dataId),
    getFirstBinding: () => bindings.values().next().value,
    getBindings: () => bindings.entries(),
    removeData: (dataId) => bindings.delete(dataId),
  });
}

describe('Planar mounted-data orchestration', () => {
  it('promotes one source and returns actors with source before overlays', () => {
    const bindings = new Map([
      [
        'source',
        createBinding({
          actorUID: 'source-actor',
          dataId: 'source',
          role: 'source',
        }),
      ],
      [
        'overlay',
        createBinding({
          actorUID: 'overlay-actor',
          dataId: 'overlay',
        }),
      ],
    ]);
    const mountedData = createMountedData(bindings);

    mountedData.promoteSourceDataId('overlay');

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
          dataId: 'source',
          role: 'source',
        }),
      ],
      [
        'overlay',
        createBinding({
          actorUID: 'overlay-actor',
          dataId: 'overlay',
        }),
      ],
    ]);
    const mountedData = createMountedData(bindings);

    mountedData.promoteSourceDataId('source');
    bindings.delete('source');
    mountedData.handleRemovedData('source');

    expect(mountedData.getActiveDataId()).toBe('overlay');
    expect(bindings.get('overlay').role).toBe('source');
  });
});

describe('Planar view-reference orchestration', () => {
  it('activates the binding that owns an image reference before navigation', () => {
    const bindings = new Map([
      [
        'source',
        createBinding({
          actorUID: 'source-actor',
          dataId: 'source',
          imageIds: ['image:source'],
          role: 'source',
        }),
      ],
      [
        'overlay',
        createBinding({
          actorUID: 'overlay-actor',
          dataId: 'overlay',
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
    const render = jest.fn();
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
    const updateBindingsCameraState = jest.fn();

    mountedData.promoteSourceDataId('source');

    const references = new PlanarViewReferenceController({
      viewportId: 'viewport-1',
      viewportType: 'planar',
      getActiveDataId: () => mountedData.getActiveDataId(),
      getBinding: (dataId) => bindings.get(dataId),
      getBindings: () => bindings.entries(),
      getCurrentBinding: () => mountedData.getCurrentBinding(),
      getRenderContext: () => ({
        viewportId: 'viewport-1',
        renderingEngineId: 'rendering-engine',
        type: 'planar',
        viewport: {
          element: document.createElement('div'),
          getActiveDataId: () => mountedData.getActiveDataId(),
          getOverlayActors: () =>
            mountedData.getProjectedActorEntries('overlay'),
          getViewState: () => viewState,
          isCurrentDataId: (dataId) =>
            mountedData.getCurrentBinding()?.data.id === dataId,
        },
        renderPath: {
          renderMode: ActorRenderMode.CPU_IMAGE,
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
      promoteSourceDataId: (dataId) => mountedData.promoteSourceDataId(dataId),
      render,
      setImageIdIndex,
      setViewState: (viewStatePatch) => {
        viewState = {
          ...viewState,
          ...viewStatePatch,
        };
      },
      updateBindingsCameraState,
    });

    references.setViewReference({
      FrameOfReferenceUID: 'for-1',
      referencedImageId: 'image:overlay',
    });

    expect(mountedData.getActiveDataId()).toBe('overlay');
    expect(updateBindingsCameraState).toHaveBeenCalledTimes(1);
    expect(setImageIdIndex).toHaveBeenCalledWith(0);
    expect(render).not.toHaveBeenCalled();
  });
});
