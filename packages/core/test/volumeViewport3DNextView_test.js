import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import setCtTransferFunctionForVolumeActor, {
  ctVoiRange,
} from '../../../utils/demo/helpers/setCtTransferFunctionForVolumeActor';
import setPetTransferFunctionForVolumeActor from '../../../utils/demo/helpers/setPetTransferFunctionForVolumeActor';

const { Enums, volumeLoader, utilities, getConfiguration, cache } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events, BlendModes, InterpolationType } =
  Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * Makes a legacy 3D viewport and a direct next 3D viewport of the same size
 * and orientation, with the same options, in one rendering engine. The
 * switch of the generic viewports is off for the legacy one, so it is the
 * legacy class with or without FORCE_GENERIC_VIEWPORT.
 */
function createPair(renderingEngine, options = {}) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;

  return [
    ['legacy3D', ViewportType.VOLUME_3D, false],
    ['next3D', ViewportType.VOLUME_3D_NEXT, useGenericViewport],
  ].map(([viewportId, type, useGeneric]) => {
    const element = document.createElement('div');

    element.style.width = '400px';
    element.style.height = '300px';
    document.body.appendChild(element);
    rendering.useGenericViewport = useGeneric;
    renderingEngine.enableElement({
      viewportId,
      type,
      element,
      defaultOptions: {
        orientation: OrientationAxis.SAGITTAL,
        background: [1, 0, 1],
        ...options,
      },
    });
    rendering.useGenericViewport = useGenericViewport;

    return renderingEngine.getViewport(viewportId);
  });
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

/** Shows the volume on the legacy viewport and on the next viewport. */
async function showOnBoth(legacy, next, volumeId) {
  const displaySetId = `next3D:${next.id}`;

  await legacy.setVolumes([{ volumeId }]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
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
function expectSameCamera(next, legacy) {
  const nextCamera = next.getViewState();
  const legacyCamera = legacy.getCamera();

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
 * their canvas points to be the same on both viewports.
 */
function expectSameTransforms(next, legacy, volumeId) {
  knownPointsOf(volumeId).forEach((point) => {
    const canvasPoint = legacy.worldToCanvas(point);

    expectPointsClose(next.worldToCanvas(point), canvasPoint, 3);
    expectPointsClose(
      next.canvasToWorld(canvasPoint),
      legacy.canvasToWorld(canvasPoint),
      3
    );
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
async function expectSamePicture(next, legacy, outputName) {
  const legacyPicture = await pictureOf(legacy);
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
    const [legacy, next] = createPair(renderingEngine, {
      parallelProjection: false,
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    expect(legacy.getCamera().parallelProjection).toBe(false);
    expectSameCamera(next, legacy);
    expectSameTransforms(next, legacy, volumeId);
    await expectSamePicture(next, legacy, 'next3D_perspective');
  });

  it('takes a parallel scale, dollies and resets as a legacy 3D viewport in perspective', async function () {
    const [legacy, next] = createPair(renderingEngine, {
      parallelProjection: false,
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    legacy.setZoom(2);
    next.setViewState({
      parallelScale: next.getViewState().parallelScale / 2,
    });

    expectSameCamera(next, legacy);
    expectSameTransforms(next, legacy, volumeId);

    const { focalPoint, position } = legacy.getCamera();
    const dolly = {
      position: position.map(
        (value, index) => focalPoint[index] + (value - focalPoint[index]) / 4
      ),
    };

    legacy.setCamera(dolly);
    next.setViewState(dolly);

    expectSameCamera(next, legacy);
    expectSameTransforms(next, legacy, volumeId);
    await expectSamePicture(next, legacy, 'next3D_perspective_dolly');

    legacy.resetCamera();
    next.resetViewState();

    expectSameCamera(next, legacy);
    expectSameTransforms(next, legacy, volumeId);
    await expectSamePicture(next, legacy, 'next3D_perspective_reset');
  });

  it('turns to perspective through the view state, as the legacy viewport made with the option', async function () {
    const [legacy] = createPair(renderingEngine, {
      parallelProjection: false,
    });
    const element = document.createElement('div');

    element.style.width = '400px';
    element.style.height = '300px';
    document.body.appendChild(element);
    renderingEngine.enableElement({
      viewportId: 'changed3D',
      type: ViewportType.VOLUME_3D_NEXT,
      element,
      defaultOptions: {
        orientation: OrientationAxis.SAGITTAL,
        background: [1, 0, 1],
      },
    });

    const changed = renderingEngine.getViewport('changed3D');
    const volumeId = await createVolume();

    await showOnBoth(legacy, changed, volumeId);
    changed.setViewState({ parallelProjection: false });
    changed.resetViewState();

    expectSameCamera(changed, legacy);
    await expectSamePicture(changed, legacy, 'next3D_perspective_option');
  });
});

/** Registers a display set of a volume for a direct next viewport. */
function addVolumeDisplaySet(displaySetId, volumeId) {
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
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
      type: ViewportType.PLANAR_NEXT,
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
 * The callback of the label volume of the volumeProgressive example: nearest
 * interpolation, no shade, black and transparent at 0, and the colour of each
 * segment, opaque, at its index.
 */
function labelCallback({ volumeActor }) {
  const property = volumeActor.getProperty();
  const colors = property.getRGBTransferFunction(0);
  const opacity = property.getScalarOpacity(0);

  property.setInterpolationTypeToNearest();
  property.setShade(false);
  colors.removeAllPoints();
  opacity.removeAllPoints();
  colors.addRGBPoint(0, 0, 0, 0);
  opacity.addPoint(0, 0);
  SEGMENT_COLORS.slice(1).forEach(([r, g, b], segmentIndex) => {
    colors.addRGBPoint(segmentIndex + 1, r / 255, g / 255, b / 255);
    opacity.addPoint(segmentIndex + 1, 1);
  });
}

/**
 * The preset that gives the picture of the label callback: the colour
 * points and the opacity points of the callback, no shade, and an opacity
 * that the gradient does not change.
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
 * Shows a volume on a legacy viewport through `setVolumes` with a volume
 * input, and on a direct next viewport with a presentation.
 */
async function showWithPresentation(
  legacy,
  next,
  volumeId,
  volumeInput,
  presentation
) {
  await legacy.setVolumes([{ volumeId, ...volumeInput }]);

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
    const [legacy, next] = createPair(renderingEngine);
    const volumeId = await createVolume();
    const values = [-200, -160, 0, 40, 100, 200, 240, 300];

    await showWithPresentation(
      legacy,
      next,
      volumeId,
      { callback: setCtTransferFunctionForVolumeActor },
      { voiRange: ctVoiRange }
    );

    coloursAt(next, values).forEach((rgb, index) =>
      expectPointsClose(rgb, coloursAt(legacy, values)[index])
    );
    expectPointsClose(opacitiesAt(next, values), opacitiesAt(legacy, values));
    await expectSamePicture(next, legacy, 'next3D_callback_ct');
  });

  it('draws the PET transfer function callback with a MIP blend mode as voiRange, invert and blendMode of the presentation', async function () {
    const [legacy, next] = createPair(renderingEngine);
    const volumeId = await createVolume('pet', (i, j, k) => (i + j + k) % 7);
    const values = [0, 1, 2.5, 4, 5, 6];

    await showWithPresentation(
      legacy,
      next,
      volumeId,
      {
        callback: setPetTransferFunctionForVolumeActor,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      },
      {
        voiRange: { lower: 0, upper: 5 },
        invert: true,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      }
    );

    coloursAt(next, values).forEach((rgb, index) =>
      expectPointsClose(rgb, coloursAt(legacy, values)[index])
    );
    expect(next.getActors()[0].actor.getMapper().getBlendMode()).toBe(
      legacy.getActors()[0].actor.getMapper().getBlendMode()
    );
    await expectSamePicture(next, legacy, 'next3D_callback_pet_mip');
  });

  it('draws the label callback with a preset object and the interpolation type of the presentation', async function () {
    const [legacy, next] = createPair(renderingEngine);
    const volumeId = await createVolume('labels', (i, j, k) =>
      i < 10 ? 0 : 1 + ((Math.floor(i / 10) + j + k) % 3)
    );
    const values = [0, 0.5, 1, 1.5, 2, 3];

    await showWithPresentation(
      legacy,
      next,
      volumeId,
      { callback: labelCallback },
      { preset: LABEL_PRESET, interpolationType: InterpolationType.NEAREST }
    );

    const legacyProperty = legacy.getActors()[0].actor.getProperty();
    const nextProperty = next.getActors()[0].actor.getProperty();

    coloursAt(next, values).forEach((rgb, index) =>
      expectPointsClose(rgb, coloursAt(legacy, values)[index])
    );
    expectPointsClose(opacitiesAt(next, values), opacitiesAt(legacy, values));
    expect(nextProperty.getInterpolationType()).toBe(
      legacyProperty.getInterpolationType()
    );
    expect(nextProperty.getShade()).toBe(legacyProperty.getShade());
    await expectSamePicture(next, legacy, 'next3D_callback_labels');
  });
});
