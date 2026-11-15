jest.mock('../src/cache/cache', () => ({
  __esModule: true,
  default: {
    getVolume: jest.fn(),
  },
}));

jest.mock('../src/utilities/genericViewportDisplaySetMetadataProvider', () => ({
  __esModule: true,
  default: {
    add: jest.fn(),
    remove: jest.fn(),
  },
}));

import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import cache from '../src/cache/cache';
import BlendModes from '../src/enums/BlendModes';
import RENDERING_DEFAULTS from '../src/constants/rendering';
import PlanarLegacyCompatibilityController from '../src/RenderingEngine/GenericViewport/Planar/PlanarLegacyCompatibilityController';
import { applyPlanarVolumePresentation } from '../src/RenderingEngine/GenericViewport/Planar/planarVolumePresentation';

const dataId = '__planar_v2__:vp-1:volume:vol-1';

/**
 * An image slice actor on a small float volume whose values run from 0 to
 * 149.5, like a PET volume in SUV.
 */
function createVolumeActor() {
  const values = new Float32Array(4 * 4 * 4).map((_, index) => index * 2.373);
  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(4, 4, 4);
  imageData.getPointData().setScalars(
    vtkDataArray.newInstance({
      numberOfComponents: 1,
      values,
    })
  );

  const mapper = vtkImageResliceMapper.newInstance();
  const actor = vtkImageSlice.newInstance();

  mapper.setInputData(imageData);
  actor.setMapper(mapper);

  return actor;
}

/**
 * A host that keeps the presentation as the viewport does (a display set
 * presentation merges, a data presentation state replaces) and applies it to
 * the actor of the binding as the GPU volume slice path does. `remount` makes
 * a new actor and applies only the stored presentation to it, as a change of
 * render path does.
 */
function createHost() {
  const presentations = new Map();
  let actor;

  const apply = () => {
    if (!actor) {
      return;
    }

    applyPlanarVolumePresentation({
      actor,
      mapper: actor.getMapper(),
      props: presentations.get(dataId),
    });
  };

  const host = {
    getElement: () => document.createElement('div'),
    getViewportId: () => 'vp-1',
    getRequestedOrientation: () => undefined,
    prepareVolumeCompatibilityCamera: jest.fn(),
    setDisplaySets: jest.fn(async () => {
      actor = createVolumeActor();
      apply();
    }),
    setImageIdIndex: jest.fn(async () => 'image-0'),
    getCurrentImageId: jest.fn(() => undefined),
    render: jest.fn(),
    removeBindingsExcept: jest.fn(),
    setCameraOrientation: jest.fn(),
    setDataPresentationState: jest.fn((id, props) => {
      presentations.set(id, props);
      apply();
    }),
    setDisplaySetPresentation: jest.fn((id, props) => {
      presentations.set(id, { ...presentations.get(id), ...props });
      apply();
    }),
    getDisplaySetPresentation: jest.fn((id) => presentations.get(id)),
    getCameraOrientation: jest.fn(() => undefined),
    getCurrentPlanarRendering: jest.fn(() => undefined),
    getActiveDataId: jest.fn(() => dataId),
    getFirstBoundDataId: jest.fn(() => dataId),
    findDataIdByVolumeId: jest.fn(() => dataId),
    getBindingActor: jest.fn(() => actor),
    getBindingRenderMode: jest.fn(() => 'vtkVolumeSlice'),
    getDefaultVOIRange: jest.fn(() => undefined),
    getImageCount: jest.fn(() => 4),
    getMaxImageIdIndex: jest.fn(() => 3),
  };

  return {
    host,
    getActor: () => actor,
    remount: () => {
      actor = createVolumeActor();
      apply();
    },
  };
}

function opacityPointsOf(actor) {
  return Array.from(actor.getProperty().getScalarOpacity(0).getDataPointer());
}

/**
 * A callback like the PET colour helper of the examples: an hsv colour
 * function on the given range and an opacity function with absolute values.
 */
function createColorCallback(colorRange, opacityPoints) {
  return ({ volumeActor }) => {
    const colorFunction = vtkColorTransferFunction.newInstance();

    colorFunction.applyColorMap(vtkColorMaps.getPresetByName('hsv'));
    colorFunction.setMappingRange(colorRange[0], colorRange[1]);

    const property = volumeActor.getProperty();

    property.setRGBTransferFunction(0, colorFunction);
    property.setUseLookupTableScalarRange(true);

    const opacityFunction = vtkPiecewiseFunction.newInstance();

    for (let i = 0; i < opacityPoints.length; i += 2) {
      opacityFunction.addPoint(opacityPoints[i], opacityPoints[i + 1]);
    }

    property.setScalarOpacity(0, opacityFunction);
  };
}

async function mountWithCallback(callback, volumeInput = {}) {
  cache.getVolume.mockReturnValue({ imageIds: ['v-0', 'v-1', 'v-2', 'v-3'] });

  const hostState = createHost();
  const controller = new PlanarLegacyCompatibilityController(hostState.host);

  await controller.setVolumes([
    { volumeId: 'vol-1', callback, ...volumeInput },
  ]);

  return { ...hostState, controller };
}

describe('PlanarLegacyCompatibilityController read-back of a callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const cases = [
    {
      name: 'a threshold-like first point and a 0-based colour range',
      colorRange: [0, 5],
      points: [0, 0, 0.1, 0.9, 5, 1],
    },
    {
      name: 'no threshold-like point and a colour range that is not 0-based',
      colorRange: [2, 12],
      points: [0, 0.2, 2, 0.5, 10, 1],
    },
  ];

  cases.forEach(({ name, colorRange, points }) => {
    describe(name, () => {
      it('gives the actor the opacity function that the callback wrote', async () => {
        const { getActor, host } = await mountWithCallback(
          createColorCallback(colorRange, points)
        );

        expect(opacityPointsOf(getActor())).toEqual(points);
        expect(host.getDisplaySetPresentation(dataId).voiRange).toEqual({
          lower: colorRange[0],
          upper: colorRange[1],
        });
      });

      it('keeps the function on a window level change and a second application', async () => {
        const { controller, getActor } = await mountWithCallback(
          createColorCallback(colorRange, points)
        );

        controller.setProperties({ voiRange: { lower: 3, upper: 40 } });
        expect(opacityPointsOf(getActor())).toEqual(points);

        controller.setProperties({ voiRange: { lower: 3, upper: 40 } });
        expect(opacityPointsOf(getActor())).toEqual(points);
      });

      it('keeps the function on a colormap name change', async () => {
        const { controller, getActor, remount } = await mountWithCallback(
          createColorCallback(colorRange, points)
        );

        controller.setProperties({ colormap: { name: 'jet' } });
        expect(opacityPointsOf(getActor())).toEqual(points);

        remount();
        expect(opacityPointsOf(getActor())).toEqual(points);
      });

      it('gives a remounted actor the same function from the stored presentation', async () => {
        const { controller, getActor, remount } = await mountWithCallback(
          createColorCallback(colorRange, points)
        );

        controller.setProperties({ voiRange: { lower: 1, upper: 9 } });
        remount();

        expect(opacityPointsOf(getActor())).toEqual(points);
      });
    });
  });

  it('reports the function as an opacity mapping with an overall opacity of 1', async () => {
    const { controller } = await mountWithCallback(
      createColorCallback([0, 5], [0, 0, 0.1, 0.9, 5, 1])
    );

    expect(controller.getProperties().colormap).toEqual({
      name: 'hsv',
      opacity: 1,
      opacityMapping: [
        { value: 0, opacity: 0 },
        { value: 0.1, opacity: 0.9 },
        { value: 5, opacity: 1 },
      ],
    });
  });

  it('scales the mapping by a numeric opacity and cuts it below a threshold', async () => {
    const { controller, getActor } = await mountWithCallback(
      createColorCallback([0, 5], [0, 0, 0.1, 0.8, 5, 1])
    );

    controller.setProperties({ colormap: { opacity: 0.5 } });
    expect(opacityPointsOf(getActor())).toEqual([0, 0, 0.1, 0.4, 5, 0.5]);

    controller.setProperties({ colormap: { threshold: 1 } });
    expect(opacityPointsOf(getActor())).toEqual([
      0,
      0,
      1 - 5 * 0.001,
      0,
      5,
      0.5,
    ]);
  });

  it('lets an opacity array of the application replace the mapping', async () => {
    const { controller, getActor } = await mountWithCallback(
      createColorCallback([0, 5], [0, 0, 0.1, 0.9, 5, 1])
    );
    const opacity = [
      { value: 0, opacity: 0 },
      { value: 1, opacity: 0.6 },
    ];

    controller.setProperties({ colormap: { opacity } });

    const reference = createVolumeActor();

    applyPlanarVolumePresentation({
      actor: reference,
      mapper: reference.getMapper(),
      props: {
        colormap: { name: 'hsv', opacity },
        voiRange: { lower: 0, upper: 5 },
      },
    });

    expect(controller.getProperties().colormap.opacityMapping).toBeUndefined();
    expect(opacityPointsOf(getActor())).toEqual(opacityPointsOf(reference));
  });

  it('keeps the presentation as before for a callback that writes no opacity function', async () => {
    const { getActor, host } = await mountWithCallback(({ volumeActor }) => {
      const colorFunction = vtkColorTransferFunction.newInstance();

      colorFunction.addRGBPoint(0, 0, 0, 0);
      colorFunction.addRGBPoint(1, 1, 1, 1);
      colorFunction.setMappingRange(-160, 240);
      volumeActor.getProperty().setRGBTransferFunction(0, colorFunction);
    });
    const presentation = host.getDisplaySetPresentation(dataId);

    expect(presentation.voiRange).toEqual({ lower: -160, upper: 240 });
    expect(presentation.colormap?.opacityMapping).toBeUndefined();
    expect(
      getActor().getProperty().getRGBTransferFunction(0).getRange()
    ).toEqual([-160, 240]);
  });
});

/**
 * The camera distance of the TMTV fusion viewports on the legacy viewport,
 * where a plain slice draws an opacity a as 1 - (1 - a)^0.125.
 */
const tmtvCameraDistance = 619.3196859878974;

function mockVolumeWithCameraDistance(distance) {
  cache.getVolume.mockReturnValue({
    imageIds: ['v-0', 'v-1', 'v-2', 'v-3'],
    imageData: { getBounds: () => [0, 2 * distance, 0, 0, 0, 0] },
  });
}

/**
 * The opacity of a piecewise linear function given as flat points at a value.
 */
function interpolate(points, value) {
  for (let i = 2; i < points.length; i += 2) {
    if (value <= points[i]) {
      const t = (value - points[i - 2]) / (points[i] - points[i - 2]);

      return points[i - 1] + (points[i + 1] - points[i - 1]) * t;
    }
  }

  return points[points.length - 1];
}

describe('PlanarLegacyCompatibilityController legacy slice opacity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const written = [0, 0, 0.1, 0.9, 5, 1];

  async function mountTmtvFusionPt(volumeInput = {}) {
    mockVolumeWithCameraDistance(tmtvCameraDistance);

    const hostState = createHost();
    const controller = new PlanarLegacyCompatibilityController(hostState.host);

    await controller.setVolumes([
      {
        volumeId: 'vol-1',
        callback: createColorCallback([0, 5], written),
        ...volumeInput,
      },
    ]);

    return { ...hostState, controller };
  }

  it('draws the opacity of the legacy slice, 1 - (1 - a)^0.125 at the TMTV camera distance', async () => {
    const { getActor } = await mountTmtvFusionPt();
    const points = opacityPointsOf(getActor());
    const law = (a) => 1 - (1 - a) ** 0.125;

    expect(points.slice(0, 2)).toEqual([0, 0]);
    expect(interpolate(points, 0.1)).toBeCloseTo(law(0.9), 10);
    expect(interpolate(points, 5)).toBe(1);

    let largestError = 0;

    for (let i = 0; i <= 20000; i++) {
      const value = (5 * i) / 20000;

      if (value > 5 - 5 / 65536) {
        continue;
      }

      const a = interpolate(written, value);

      largestError = Math.max(
        largestError,
        Math.abs(interpolate(points, value) - law(a))
      );
    }

    expect(largestError).toBeLessThan(1 / 255);
  });

  it('follows the length of the legacy ray, rounded as 32-bit floats from the near plane', async () => {
    const lengths = [];

    for (const distance of [619.3196859878974, 619.29, 100.01, 300]) {
      mockVolumeWithCameraDistance(distance);

      const hostState = createHost();
      const controller = new PlanarLegacyCompatibilityController(
        hostState.host
      );

      await controller.setVolumes([
        { volumeId: 'vol-1', callback: createColorCallback([0, 5], written) },
      ]);

      const drawn = interpolate(opacityPointsOf(hostState.getActor()), 0.1);

      lengths.push(Math.log(1 - drawn) / Math.log(0.1));
    }

    const expected = [619.3196859878974, 619.29, 100.01, 300].map(
      (distance) =>
        Math.fround(1e6 + distance + 0.05) - Math.fround(1e6 + distance - 0.05)
    );

    lengths.forEach((length, index) => {
      expect(length).toBeCloseTo(expected[index], 6);
    });
    expect(expected[0]).toBe(0.125);
  });

  it('keeps the drawn function on window level, colormap and remount', async () => {
    const { controller, getActor, remount } = await mountTmtvFusionPt();
    const points = opacityPointsOf(getActor());

    controller.setProperties({ voiRange: { lower: 1, upper: 8 } });
    controller.setProperties({ colormap: { name: 'jet' } });
    remount();

    expect(opacityPointsOf(getActor())).toEqual(points);
    expect(controller.getProperties().colormap.opacityMapping.length).toBe(
      points.length / 2
    );
  });

  it('keeps the function as written for a volume with a slab or another blend mode', async () => {
    for (const volumeInput of [
      { slabThickness: 20 },
      { blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    ]) {
      const { getActor } = await mountTmtvFusionPt(volumeInput);

      expect(opacityPointsOf(getActor())).toEqual(written);
    }
  });
});

describe('PlanarLegacyCompatibilityController slab thickness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the slab thickness, blend mode and visibility of setVolumes after a callback', async () => {
    const { controller, getActor, host } = await mountWithCallback(
      createColorCallback([0, 5], [0, 0, 5, 1]),
      {
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        slabThickness: 359.8,
        visibility: false,
      }
    );
    const presentation = host.getDisplaySetPresentation(dataId);

    expect(presentation.slabThickness).toBe(359.8);
    expect(presentation.blendMode).toBe(BlendModes.MAXIMUM_INTENSITY_BLEND);
    expect(presentation.visible).toBe(false);
    expect(getActor().getMapper().getSlabThickness()).toBe(359.8);
    expect(getActor().getVisibility()).toBe(false);
    expect(controller.getSlabThickness()).toBe(359.8);

    controller.setProperties({ voiRange: { lower: 0, upper: 3 } });
    expect(getActor().getMapper().getSlabThickness()).toBe(359.8);
    expect(controller.getProperties().slabThickness).toBe(359.8);
  });

  it('gives the minimum slab thickness when no volume has a slab', async () => {
    const { controller } = await mountWithCallback(undefined);

    expect(controller.getSlabThickness()).toBe(
      RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
    );
  });

  it('sets and resets the slab thickness so that later property changes keep it', async () => {
    const { controller, getActor } = await mountWithCallback(undefined);

    controller.setSlabThickness(20);
    controller.setProperties({ voiRange: { lower: 0, upper: 3 } });
    expect(getActor().getMapper().getSlabThickness()).toBe(20);
    expect(controller.getSlabThickness()).toBe(20);

    controller.setSlabThickness(0.01);
    expect(controller.getSlabThickness()).toBe(
      RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
    );

    controller.setSlabThickness(30);
    controller.resetSlabThickness();
    controller.setProperties({ voiRange: { lower: 0, upper: 4 } });
    expect(controller.getSlabThickness()).toBe(
      RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
    );
    expect(controller.getProperties().slabThickness).toBeUndefined();
  });

  it('keeps the slab thickness through setBlendMode', async () => {
    const { controller, getActor } = await mountWithCallback(undefined, {
      slabThickness: 40,
    });

    controller.setBlendMode(BlendModes.MINIMUM_INTENSITY_BLEND);
    controller.setProperties({ voiRange: { lower: 0, upper: 3 } });

    expect(getActor().getMapper().getSlabThickness()).toBe(40);
  });
});
