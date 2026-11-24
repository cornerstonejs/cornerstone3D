import { PlanarRenderModeId } from '../src/RenderingEngine/Viewports/Planar/planarRenderModeIds';
import PlanarMountedData from '../src/RenderingEngine/Viewports/Planar/PlanarMountedData';
import { isInAcquisitionPlane } from '../src/utilities/isInAcquisitionPlane';
import {
  viewportIsInStackMode,
  viewportIsInVolumeMode,
} from '../src/utilities/viewportCapabilities';

/**
 * A binding of a planar viewport: a display set with a volume id, drawn in a
 * render mode, with the rendering fields that the queries read.
 */
function createBinding({
  displaySetId,
  role = 'overlay',
  volumeId,
  renderMode = PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
  reference,
  imageVolume,
  image,
  rendering = {},
}) {
  return {
    data: {
      id: displaySetId,
      type: 'image',
      imageIds: [`${displaySetId}-image`],
      volumeId,
      reference,
      imageVolume,
      image,
    },
    role,
    rendering: { renderMode, ...rendering },
    applyViewState: jest.fn(),
    getFrameOfReferenceUID: () => 'for-1',
    removeData: jest.fn(),
    updateAppearance: jest.fn(),
  };
}

function createMountedData(entries) {
  const bindings = new Map(
    entries.map((binding) => [binding.data.id, binding])
  );

  return new PlanarMountedData({
    getBinding: (displaySetId) => bindings.get(displaySetId),
    getFirstBinding: () => bindings.values().next().value,
    getBindings: () => bindings.entries(),
    removeDisplaySet: (displaySetId) => bindings.delete(displaySetId),
  });
}

/** A volume whose voxel manager gives `range`, loading or not. */
function createVolume(range, loading = false) {
  return {
    voxelManager: { getRange: () => range },
    loadStatus: { loading, loaded: !loading },
  };
}

const SEGMENTATION = {
  kind: 'segmentation',
  segmentationId: 'segmentation1',
  representationUID: 'segmentation1-Labelmap-1',
};

describe('The volume ids of the display sets of a planar viewport -- ', () => {
  it('gives each volume once, the source first, whatever the mount order', () => {
    const mountedData = createMountedData([
      createBinding({ displaySetId: 'pt', volumeId: 'volume:pt' }),
      createBinding({
        displaySetId: 'ct',
        role: 'source',
        volumeId: 'volume:ct',
      }),
      createBinding({ displaySetId: 'ptAgain', volumeId: 'volume:pt' }),
    ]);

    expect(mountedData.getVolumeIds(false)).toEqual(['volume:ct', 'volume:pt']);
  });

  it('leaves out the labelmap overlay of a segmentation unless asked for it', () => {
    const mountedData = createMountedData([
      createBinding({
        displaySetId: 'ct',
        role: 'source',
        volumeId: 'volume:ct',
      }),
      createBinding({
        displaySetId: SEGMENTATION.representationUID,
        volumeId: 'volume:labelmap',
        reference: SEGMENTATION,
      }),
    ]);

    expect(mountedData.getVolumeIds(false)).toEqual(['volume:ct']);
    expect(mountedData.getVolumeIds(true)).toEqual([
      'volume:ct',
      'volume:labelmap',
    ]);
  });

  it('keeps a segmentation that is the source: it is what the view shows', () => {
    const mountedData = createMountedData([
      createBinding({
        displaySetId: 'labelmapSource',
        role: 'source',
        volumeId: 'volume:labelmap',
        reference: SEGMENTATION,
      }),
    ]);

    expect(mountedData.getVolumeIds(false)).toEqual(['volume:labelmap']);
  });

  it('gives no volume for display sets drawn as images', () => {
    const mountedData = createMountedData([
      createBinding({
        displaySetId: 'ct',
        role: 'source',
        volumeId: 'volume:ct',
        renderMode: PlanarRenderModeId.VTK_FRAME,
      }),
      createBinding({
        displaySetId: 'pt',
        volumeId: 'volume:pt',
        renderMode: PlanarRenderModeId.CANVAS_FRAME,
      }),
    ]);

    expect(mountedData.getVolumeIds(true)).toEqual([]);
  });
});

describe('The display set of a volume id of a planar viewport -- ', () => {
  it('gives the source when two display sets share the volume, though the source was mounted second', () => {
    const mountedData = createMountedData([
      createBinding({ displaySetId: 'overlay', volumeId: 'volume:shared' }),
      createBinding({
        displaySetId: 'source',
        role: 'source',
        volumeId: 'volume:shared',
      }),
    ]);

    expect(mountedData.findDisplaySetIdByVolumeId('volume:shared')).toBe(
      'source'
    );
  });

  it('gives the first in mount order when the source does not have the volume, and nothing for an unknown id', () => {
    const mountedData = createMountedData([
      createBinding({
        displaySetId: 'source',
        role: 'source',
        volumeId: 'volume:ct',
      }),
      createBinding({ displaySetId: 'first', volumeId: 'volume:pt' }),
      createBinding({ displaySetId: 'second', volumeId: 'volume:pt' }),
    ]);

    expect(mountedData.findDisplaySetIdByVolumeId('volume:pt')).toBe('first');
    expect(mountedData.findDisplaySetIdByVolumeId('volume:none')).toBe(
      undefined
    );
  });
});

describe('The scalar range of a display set of a planar viewport -- ', () => {
  it('gives the range of the whole volume of a display set drawn as a volume, the source when none is named', () => {
    const ct = createVolume([-1024, 3071]);
    const pt = createVolume([0, 12]);
    const mountedData = createMountedData([
      createBinding({
        displaySetId: 'ct',
        role: 'source',
        volumeId: 'volume:ct',
        renderMode: PlanarRenderModeId.VTK_CPU_SLICE,
        rendering: { imageVolume: ct },
      }),
      createBinding({
        displaySetId: 'pt',
        volumeId: 'volume:pt',
        renderMode: PlanarRenderModeId.CANVAS_CPU_SLICE,
        imageVolume: pt,
      }),
    ]);

    mountedData.promoteSourceDisplaySetId('ct');

    expect(mountedData.getScalarRange()).toEqual([-1024, 3071]);
    expect(mountedData.getScalarRange('ct')).toEqual([-1024, 3071]);
    expect(mountedData.getScalarRange('pt')).toEqual([0, 12]);
    expect(mountedData.getScalarRange('other')).toBeUndefined();
  });

  it('gives nothing while a volume loads and no image of it has arrived, and [0, 0] for a loaded volume of zeros', () => {
    const mountedData = createMountedData([
      createBinding({
        displaySetId: 'loading',
        volumeId: 'volume:loading',
        rendering: { imageVolume: createVolume([0, 0], true) },
      }),
      createBinding({
        displaySetId: 'partly',
        volumeId: 'volume:partly',
        rendering: { imageVolume: createVolume([-5, 40], true) },
      }),
      createBinding({
        displaySetId: 'zeros',
        volumeId: 'volume:zeros',
        rendering: { imageVolume: createVolume([0, 0]) },
      }),
    ]);

    expect(mountedData.getScalarRange('loading')).toBeUndefined();
    expect(mountedData.getScalarRange('partly')).toEqual([-5, 40]);
    expect(mountedData.getScalarRange('zeros')).toEqual([0, 0]);
  });

  it('gives the range of the image on display of a display set drawn as images, on the GPU and on the CPU', () => {
    const first = { minPixelValue: -10, maxPixelValue: 90 };
    const shown = { minPixelValue: -30, maxPixelValue: 120 };
    const mountedData = createMountedData([
      createBinding({
        displaySetId: 'gpu',
        volumeId: 'volume:gpu',
        renderMode: PlanarRenderModeId.VTK_FRAME,
        image: first,
        rendering: { currentImage: shown },
      }),
      createBinding({
        displaySetId: 'cpu',
        volumeId: 'volume:cpu',
        renderMode: PlanarRenderModeId.CANVAS_FRAME,
        image: first,
        rendering: { enabledElement: { image: shown } },
      }),
      createBinding({
        displaySetId: 'cpuBeforeDraw',
        volumeId: 'volume:cpuBeforeDraw',
        renderMode: PlanarRenderModeId.CANVAS_FRAME,
        image: first,
        rendering: { enabledElement: {} },
      }),
      createBinding({
        displaySetId: 'noImage',
        volumeId: 'volume:noImage',
        renderMode: PlanarRenderModeId.VTK_FRAME,
      }),
    ]);

    expect(mountedData.getScalarRange('gpu')).toEqual([-30, 120]);
    expect(mountedData.getScalarRange('cpu')).toEqual([-30, 120]);
    expect(mountedData.getScalarRange('cpuBeforeDraw')).toEqual([-10, 90]);
    expect(mountedData.getScalarRange('noImage')).toBeUndefined();
  });
});

describe('utilities.isInAcquisitionPlane, by the content of a viewport -- ', () => {
  const standIn = (mode, member) => ({
    getCurrentMode: () => mode,
    ...(member ? { isInAcquisitionPlane: member } : {}),
  });

  it('takes the answer of the viewport when it has isInAcquisitionPlane', () => {
    expect(isInAcquisitionPlane(standIn('volume', () => true))).toBe(true);
    expect(isInAcquisitionPlane(standIn('stack', () => false))).toBe(false);
  });

  it('is true for a video or a whole slide image, and false for 3D content, an ECG and nothing mounted', () => {
    expect(isInAcquisitionPlane(standIn('video'))).toBe(true);
    expect(isInAcquisitionPlane(standIn('wholeSlide'))).toBe(true);
    expect(isInAcquisitionPlane(standIn('volume3d'))).toBe(false);
    expect(isInAcquisitionPlane(standIn('geometry3d'))).toBe(false);
    expect(isInAcquisitionPlane(standIn('ecg'))).toBe(false);
    expect(isInAcquisitionPlane(standIn('empty'))).toBe(false);
  });
});

describe('The content mode geometry3d -- ', () => {
  it('is neither a volume mode nor a stack mode', () => {
    const viewport = { getCurrentMode: () => 'geometry3d' };

    expect(viewportIsInVolumeMode(viewport)).toBe(false);
    expect(viewportIsInStackMode(viewport)).toBe(false);
  });
});
