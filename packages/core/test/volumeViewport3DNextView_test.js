import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { ctVoiRange } from '../../../utils/demo/helpers/setCtTransferFunctionForVolumeActor';
import * as legacy3D_perspective from './groundTruth/legacy3D_perspective.png';
import * as legacy3D_perspective_dolly from './groundTruth/legacy3D_perspective_dolly.png';
import * as legacy3D_callback_ct from './groundTruth/legacy3D_callback_ct.png';
import * as legacy3D_callback_pet_mip from './groundTruth/legacy3D_callback_pet_mip.png';
import * as legacy3D_callback_labels from './groundTruth/legacy3D_callback_labels.png';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events, BlendModes, InterpolationType } =
  Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The camera of the legacy 3D viewport of 400 by 300 pixels, sagittal, made
 * with `parallelProjection: false`, with the volume of the tests: after
 * `setVolumes`, and again after `resetCamera`.
 */
const LEGACY_PERSPECTIVE_CAMERA = {
  parallelProjection: false,
  parallelScale: 15,
  viewAngle: 90,
  focalPoint: [15, 19.5, 11],
  position: [292.308492477241, 19.5, 11],
  viewPlaneNormal: [1, 0, 0],
  viewUp: [0, 0, 1],
};

/**
 * What the legacy 3D viewport gave with `LEGACY_PERSPECTIVE_CAMERA` for each
 * point of `knownPointsOf`: `worldToCanvas` of the point, and `canvasToWorld`
 * of that canvas point.
 */
const LEGACY_PERSPECTIVE_TRANSFORMS = [
  {
    canvasPoint: [189.993448, 155.644721],
    worldPoint: [15.000007, 1.000655, 0.564472],
  },
  {
    canvasPoint: [188.891357, 156.266414],
    worldPoint: [15.000007, -1.036807, -0.584865],
  },
  {
    canvasPoint: [210.006552, 144.355279],
    worldPoint: [15.000007, 37.999345, 21.435528],
  },
  {
    canvasPoint: [211.108643, 143.733586],
    worldPoint: [15.000007, 40.036807, 22.584865],
  },
  { canvasPoint: [200, 150], worldPoint: [15.000007, 19.5, 11] },
];

/**
 * The same for the legacy 3D viewport after the dolly of the tests: its
 * position a quarter of the way from the focal point.
 */
const LEGACY_PERSPECTIVE_DOLLY_TRANSFORMS = [
  {
    canvasPoint: [165.313651, 169.566658],
    worldPoint: [15, 3.468634, 1.956666],
  },
  {
    canvasPoint: [147.132621, 179.822624],
    worldPoint: [15, -4.934289, -2.783445],
  },
  {
    canvasPoint: [234.686349, 130.433342],
    worldPoint: [15, 35.531366, 20.043334],
  },
  {
    canvasPoint: [252.867379, 120.177376],
    worldPoint: [15, 43.934289, 24.783445],
  },
  { canvasPoint: [200, 150], worldPoint: [15, 19.5, 11] },
];

/**
 * The pictures that the legacy 3D viewport drew: in perspective with
 * `LEGACY_PERSPECTIVE_CAMERA`, and after the dolly of the tests.
 */
const LEGACY_PERSPECTIVE_PICTURE = legacy3D_perspective.default;
const LEGACY_PERSPECTIVE_DOLLY_PICTURE = legacy3D_perspective_dolly.default;

/**
 * Makes a direct next 3D viewport of 400 by 300 pixels, sagittal, with the
 * magenta background of the tests, in the rendering engine.
 */
function createNextViewport(renderingEngine, options = {}) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId: 'next3D',
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      orientation: OrientationAxis.SAGITTAL,
      background: [1, 0, 1],
      ...options,
    },
  });

  return renderingEngine.getViewport('next3D');
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart, so the extent differs along each axis. Its
 * values, from `valueAt` of the voxel index, make stripes along each axis
 * by default, so its pictures show where it is. The name is also the id of
 * its images.
 */
async function createVolume(
  name = 'volumeURI',
  valueAt = (i, j, k) => (i * 9 + j * 5 + k * 20) % 256
) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  const { voxelManager, dimensions } = cache.getVolume(volumeId);

  for (let k = 0; k < dimensions[2]; k++) {
    for (let j = 0; j < dimensions[1]; j++) {
      for (let i = 0; i < dimensions[0]; i++) {
        voxelManager.setAtIJK(i, j, k, valueAt(i, j, k));
      }
    }
  }

  return volumeId;
}

/** Shows the volume on the next viewport through a display set. */
async function showVolume(next, volumeId) {
  const displaySetId = `next3D:${next.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await next.setDisplaySets({
    displaySetId,
    options: { renderMode: 'vtkVolume3d' },
  });

  return displaySetId;
}

function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

/** Expects the camera of the next viewport to be the legacy camera. */
function expectSameCamera(next, legacyCamera) {
  const nextCamera = next.getViewState();

  expect(nextCamera.parallelProjection).toBe(legacyCamera.parallelProjection);
  expect(nextCamera.parallelScale).toBeCloseTo(legacyCamera.parallelScale, 4);
  expect(nextCamera.viewAngle).toBeCloseTo(legacyCamera.viewAngle, 4);
  expectPointsClose(nextCamera.focalPoint, legacyCamera.focalPoint);
  expectPointsClose(nextCamera.position, legacyCamera.position, 3);
  expectPointsClose(nextCamera.viewPlaneNormal, legacyCamera.viewPlaneNormal);
  expectPointsClose(nextCamera.viewUp, legacyCamera.viewUp);
}

/** The corners and the centre of the image cube of the volume, in world. */
function knownPointsOf(volumeId) {
  const { imageData } = cache.getVolume(volumeId);
  const [columns, rows, slices] = imageData.getDimensions();

  return [
    [0, 0, 0],
    [columns - 1, 0, 0],
    [0, rows - 1, slices - 1],
    [columns - 1, rows - 1, slices - 1],
    [(columns - 1) / 2, (rows - 1) / 2, (slices - 1) / 2],
  ].map((index) => imageData.indexToWorld(index));
}

/**
 * Expects `worldToCanvas` of the known points and `canvasToWorld` back of
 * their canvas points to be what the legacy viewport gave.
 */
function expectSameTransforms(next, legacyTransforms, volumeId) {
  knownPointsOf(volumeId).forEach((point, index) => {
    const { canvasPoint, worldPoint } = legacyTransforms[index];

    expectPointsClose(next.worldToCanvas(point), canvasPoint, 3);
    expectPointsClose(next.canvasToWorld(canvasPoint), worldPoint, 3);
  });
}

/** Renders a viewport and gives its picture. */
async function pictureOf(viewport) {
  const rendered = new Promise((resolve) =>
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    })
  );

  viewport.render();
  await rendered;

  return viewport.canvas.toDataURL('image/png');
}

/** Expects the picture of the next viewport to be the legacy picture. */
async function expectSamePicture(next, legacyPicture, outputName) {
  const nextPicture = await pictureOf(next);

  await testUtils.compareImagesToImage(nextPicture, legacyPicture, outputName);
}

describe('Direct next 3D viewport in perspective -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('draws a volume and maps points as a legacy 3D viewport in perspective', async function () {
    const next = createNextViewport(renderingEngine, {
      parallelProjection: false,
    });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    expectSameCamera(next, LEGACY_PERSPECTIVE_CAMERA);
    expectSameTransforms(next, LEGACY_PERSPECTIVE_TRANSFORMS, volumeId);
    await expectSamePicture(
      next,
      LEGACY_PERSPECTIVE_PICTURE,
      'next3D_perspective'
    );
  });

  it('takes a parallel scale, dollies and resets as a legacy 3D viewport in perspective', async function () {
    const next = createNextViewport(renderingEngine, {
      parallelProjection: false,
    });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const legacyZoomed = {
      ...LEGACY_PERSPECTIVE_CAMERA,
      parallelScale: LEGACY_PERSPECTIVE_CAMERA.parallelScale / 2,
    };

    next.setViewState({
      parallelScale: next.getViewState().parallelScale / 2,
    });

    expectSameCamera(next, legacyZoomed);
    expectSameTransforms(next, LEGACY_PERSPECTIVE_TRANSFORMS, volumeId);

    const { focalPoint, position } = legacyZoomed;
    const dolly = {
      position: position.map(
        (value, index) => focalPoint[index] + (value - focalPoint[index]) / 4
      ),
    };

    next.setViewState(dolly);

    expectSameCamera(next, { ...legacyZoomed, ...dolly });
    expectSameTransforms(next, LEGACY_PERSPECTIVE_DOLLY_TRANSFORMS, volumeId);
    await expectSamePicture(
      next,
      LEGACY_PERSPECTIVE_DOLLY_PICTURE,
      'next3D_perspective_dolly'
    );

    next.resetViewState();

    expectSameCamera(next, LEGACY_PERSPECTIVE_CAMERA);
    expectSameTransforms(next, LEGACY_PERSPECTIVE_TRANSFORMS, volumeId);
    await expectSamePicture(
      next,
      LEGACY_PERSPECTIVE_PICTURE,
      'next3D_perspective_reset'
    );
  });

  it('turns to perspective through the view state, as the legacy viewport made with the option', async function () {
    const element = document.createElement('div');

    element.style.width = '400px';
    element.style.height = '300px';
    document.body.appendChild(element);
    renderingEngine.enableElement({
      viewportId: 'changed3D',
      type: ViewportType.VOLUME_3D,
      element,
      defaultOptions: {
        orientation: OrientationAxis.SAGITTAL,
        background: [1, 0, 1],
      },
    });

    const changed = renderingEngine.getViewport('changed3D');
    const volumeId = await createVolume();

    await showVolume(changed, volumeId);
    changed.setViewState({ parallelProjection: false });
    changed.resetViewState();

    expectSameCamera(changed, LEGACY_PERSPECTIVE_CAMERA);
    await expectSamePicture(
      changed,
      LEGACY_PERSPECTIVE_PICTURE,
      'next3D_perspective_option'
    );
  });
});

/** Registers a display set of a volume for a direct next viewport. */
function addVolumeDisplaySet(displaySetId, volumeId) {
  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return displaySetId;
}

/** The image data that the mapper of a vtk.js actor draws. */
function inputDataOf(actor) {
  return actor.getMapper().getInputData();
}

describe('The actor of one display set on the direct next viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('gives the actor of a display set on the planar viewport by the same name', async function () {
    const element = document.createElement('div');

    element.style.width = '400px';
    element.style.height = '300px';
    document.body.appendChild(element);
    renderingEngine.enableElement({
      viewportId: 'planar',
      type: ViewportType.PLANAR,
      element,
      defaultOptions: { orientation: OrientationAxis.AXIAL },
    });

    const planar = renderingEngine.getViewport('planar');
    const firstVolumeId = await createVolume('first');
    const secondVolumeId = await createVolume('second');

    await planar.setDisplaySets(
      { displaySetId: addVolumeDisplaySet('firstSet', firstVolumeId) },
      { displaySetId: addVolumeDisplaySet('secondSet', secondVolumeId) }
    );

    const secondActor = planar.getImageActor('secondSet');

    expect(secondActor).toBeTruthy();
    expect(secondActor).not.toBe(planar.getImageActor('firstSet'));
    expect(planar.getImageActor(secondVolumeId)).toBe(secondActor);
  });
});

/** The segment colours of the label callback, by segment index. */
const SEGMENT_COLORS = [
  [0, 0, 0],
  [221, 84, 84],
  [77, 228, 121],
  [166, 70, 235],
];

/**
 * The preset that gives the picture of the label callback of the
 * volumeProgressive example: nearest interpolation, no shade, black and
 * transparent at 0, the colour of each segment, opaque, at its index, and an
 * opacity that the gradient does not change.
 */
const LABEL_PRESET = {
  name: 'labels',
  gradientOpacity: '4 0 1 255 1',
  specularPower: '10',
  scalarOpacity: `${2 * SEGMENT_COLORS.length} ${SEGMENT_COLORS.map(
    (_, index) => `${index} ${index ? 1 : 0}`
  ).join(' ')}`,
  specular: '0.2',
  shade: '0',
  ambient: '0.1',
  colorTransfer: `${4 * SEGMENT_COLORS.length} ${SEGMENT_COLORS.map(
    (color, index) => `${index} ${color.map((value) => value / 255).join(' ')}`
  ).join(' ')}`,
  diffuse: '0.7',
  interpolation: '0',
};

/** The colour of the colour transfer function of a viewport at values. */
function coloursAt(viewport, values) {
  const transferFunction = viewport
    .getActors()[0]
    .actor.getProperty()
    .getRGBTransferFunction(0);

  return values.map((value) => {
    const rgb = [];

    transferFunction.getColor(value, rgb);

    return rgb;
  });
}

/** The scalar opacity of a viewport at values. */
function opacitiesAt(viewport, values) {
  const opacity = viewport
    .getActors()[0]
    .actor.getProperty()
    .getScalarOpacity(0);

  return values.map((value) => opacity.getValue(value));
}

/**
 * What the legacy 3D viewport showed for the volume input
 * `{ callback: setCtTransferFunctionForVolumeActor }`: the colour and the
 * scalar opacity at -200, -160, 0, 40, 100, 200, 240 and 300, and its picture.
 */
const LEGACY_CT_CALLBACK = {
  colours: [
    [0, 0, 0],
    [0, 0, 0],
    [0.4, 0.4, 0.4],
    [0.5, 0.5, 0.5],
    [0.65, 0.65, 0.65],
    [0.9, 0.9, 0.9],
    [1, 1, 1],
    [1, 1, 1],
  ],
  opacities: [1, 1, 1, 1, 1, 1, 1, 1],
  picture: legacy3D_callback_ct.default,
};

/**
 * What the legacy 3D viewport showed for the volume input
 * `{ callback: setPetTransferFunctionForVolumeActor, blendMode: MAXIMUM_INTENSITY_BLEND }`:
 * the colour at 0, 1, 2.5, 4, 5 and 6, the blend mode of its mapper, and its
 * picture.
 */
const LEGACY_PET_MIP_CALLBACK = {
  colours: [
    [1, 1, 1],
    [0.8, 0.8, 0.8],
    [0.5, 0.5, 0.5],
    [0.2, 0.2, 0.2],
    [0, 0, 0],
    [0, 0, 0],
  ],
  blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
  picture: legacy3D_callback_pet_mip.default,
};

/**
 * What the legacy 3D viewport showed for the label callback of the
 * volumeProgressive example: the colour and the scalar opacity at 0, 0.5, 1,
 * 1.5, 2 and 3, the interpolation type (nearest) and the shade of its
 * property, and its picture.
 */
const LEGACY_LABEL_CALLBACK = {
  colours: [
    [0, 0, 0],
    [0.43333333333333335, 0.16470588235294117, 0.16470588235294117],
    [0.8666666666666667, 0.32941176470588235, 0.32941176470588235],
    [0.5843137254901961, 0.611764705882353, 0.4019607843137255],
    [0.30196078431372547, 0.8941176470588236, 0.4745098039215686],
    [0.6509803921568628, 0.27450980392156865, 0.9215686274509803],
  ],
  opacities: [0, 0.5, 1, 1, 1, 1],
  interpolationType: 0,
  shade: false,
  picture: legacy3D_callback_labels.default,
};

/** Shows a volume on a direct next viewport with a presentation. */
async function showWithPresentation(next, volumeId, presentation) {
  const displaySetId = addVolumeDisplaySet(`next3D:${next.id}`, volumeId);

  await next.setDisplaySets({
    displaySetId,
    options: { renderMode: 'vtkVolume3d' },
  });
  next.setDisplaySetPresentation(displaySetId, presentation);
}

describe('Presentations for the volume callbacks of the 3D examples -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('draws the CT transfer function callback with the voiRange of the presentation', async function () {
    const next = createNextViewport(renderingEngine);
    const volumeId = await createVolume();
    const values = [-200, -160, 0, 40, 100, 200, 240, 300];

    await showWithPresentation(next, volumeId, { voiRange: ctVoiRange });

    coloursAt(next, values).forEach((rgb, index) =>
      expectPointsClose(rgb, LEGACY_CT_CALLBACK.colours[index])
    );
    expectPointsClose(opacitiesAt(next, values), LEGACY_CT_CALLBACK.opacities);
    await expectSamePicture(
      next,
      LEGACY_CT_CALLBACK.picture,
      'next3D_callback_ct'
    );
  });

  it('draws the PET transfer function callback with a MIP blend mode as voiRange, invert and blendMode of the presentation', async function () {
    const next = createNextViewport(renderingEngine);
    const volumeId = await createVolume('pet', (i, j, k) => (i + j + k) % 7);
    const values = [0, 1, 2.5, 4, 5, 6];

    await showWithPresentation(next, volumeId, {
      voiRange: { lower: 0, upper: 5 },
      invert: true,
      blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
    });

    coloursAt(next, values).forEach((rgb, index) =>
      expectPointsClose(rgb, LEGACY_PET_MIP_CALLBACK.colours[index])
    );
    expect(next.getActors()[0].actor.getMapper().getBlendMode()).toBe(
      LEGACY_PET_MIP_CALLBACK.blendMode
    );
    await expectSamePicture(
      next,
      LEGACY_PET_MIP_CALLBACK.picture,
      'next3D_callback_pet_mip'
    );
  });

  it('draws the label callback with a preset object and the interpolation type of the presentation', async function () {
    const next = createNextViewport(renderingEngine);
    const volumeId = await createVolume('labels', (i, j, k) =>
      i < 10 ? 0 : 1 + ((Math.floor(i / 10) + j + k) % 3)
    );
    const values = [0, 0.5, 1, 1.5, 2, 3];

    await showWithPresentation(next, volumeId, {
      preset: LABEL_PRESET,
      interpolationType: InterpolationType.NEAREST,
    });

    const nextProperty = next.getActors()[0].actor.getProperty();

    coloursAt(next, values).forEach((rgb, index) =>
      expectPointsClose(rgb, LEGACY_LABEL_CALLBACK.colours[index])
    );
    expectPointsClose(
      opacitiesAt(next, values),
      LEGACY_LABEL_CALLBACK.opacities
    );
    expect(nextProperty.getInterpolationType()).toBe(
      LEGACY_LABEL_CALLBACK.interpolationType
    );
    expect(nextProperty.getShade()).toBe(LEGACY_LABEL_CALLBACK.shade);
    await expectSamePicture(
      next,
      LEGACY_LABEL_CALLBACK.picture,
      'next3D_callback_labels'
    );
  });
});
