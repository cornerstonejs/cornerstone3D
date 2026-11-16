import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

const { Enums, volumeLoader, utilities, getConfiguration, cache, CONSTANTS } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events, BlendModes } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * Makes viewports of one size and orientation in one rendering engine: a
 * legacy 3D viewport when `legacyId` is given, then a direct next 3D viewport
 * for each of `nextIds`. The switch of the generic viewports is off for the
 * legacy one, so it is the legacy class with or without
 * FORCE_GENERIC_VIEWPORT.
 */
function createViewports(renderingEngine, { legacyId, nextIds }) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const viewportOptions = {
    orientation: OrientationAxis.SAGITTAL,
    width: 400,
    height: 300,
    useEnableElement: true,
  };

  if (legacyId) {
    rendering.useGenericViewport = false;
    testUtils.createViewports(renderingEngine, {
      ...viewportOptions,
      viewportId: legacyId,
      viewportType: ViewportType.VOLUME_3D,
    });
    rendering.useGenericViewport = useGenericViewport;
  }

  nextIds.forEach((viewportId) =>
    testUtils.createViewports(renderingEngine, {
      ...viewportOptions,
      viewportId,
      viewportType: ViewportType.VOLUME_3D_NEXT,
    })
  );

  return [legacyId, ...nextIds]
    .filter(Boolean)
    .map((viewportId) => renderingEngine.getViewport(viewportId));
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart. The name is also the id of its images.
 */
async function createVolume(name = 'volumeURI') {
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

  return volumeId;
}

/** Registers a display set of the volume for a direct next 3D viewport. */
function addVolumeDisplaySet(displaySetId, volumeId) {
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return displaySetId;
}

/** Shows the volume on a direct next 3D viewport through a display set. */
async function showVolume(viewport, volumeId) {
  const displaySetId = addVolumeDisplaySet(`next3D:${viewport.id}`, volumeId);

  await viewport.setDisplaySets({
    displaySetId,
    options: { renderMode: 'vtkVolume3d' },
  });

  return displaySetId;
}

/** Shows the volume on the legacy and on the next viewport. */
async function showOnBoth(legacy, next, volumeId) {
  await legacy.setVolumes([{ volumeId }]);

  return showVolume(next, volumeId);
}

/** The vtk.js volume actor of the first actor entry of a viewport. */
function volumeActorOf(viewport) {
  return viewport.getActors()[0].actor;
}

function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    if (Array.isArray(value)) {
      expectPointsClose(value, expected[index], precision);

      return;
    }

    expect(value).toBeCloseTo(expected[index], precision);
  });
}

/** Values from -1100 to 1500 every 13, over the data and the CT presets. */
const SAMPLE_VALUES = Array.from(
  { length: 201 },
  (_, index) => -1100 + index * 13
);

/** The colour of the colour transfer function at each sample value. */
function sampledColoursOf(viewport) {
  const transferFunction = volumeActorOf(viewport)
    .getProperty()
    .getRGBTransferFunction(0);

  return SAMPLE_VALUES.map((value) => {
    const rgb = [];

    transferFunction.getColor(value, rgb);

    return rgb;
  });
}

/** The scalar opacity at each sample value from 0 to 255, the data range. */
function sampledOpacitiesOf(viewport) {
  const opacity = volumeActorOf(viewport).getProperty().getScalarOpacity(0);

  return SAMPLE_VALUES.filter((value) => value >= 0 && value <= 255).map(
    (value) => opacity.getValue(value)
  );
}

/**
 * Expects the same colours and the same opacities on both viewports, sampled
 * over values: the nodes may sit elsewhere for the same picture.
 */
function expectSameTransferFunctions(next, legacy) {
  expectPointsClose(sampledColoursOf(next), sampledColoursOf(legacy));
  expectPointsClose(sampledOpacitiesOf(next), sampledOpacitiesOf(legacy));
}

/** Collects the details of an event fired on the element of a viewport. */
function recordEvents(viewport, eventName) {
  const details = [];
  const listener = (event) => details.push(event.detail);

  viewport.element.addEventListener(eventName, listener);

  return details;
}

describe('Direct next 3D viewport, colour and presets -- ', () => {
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

  it('keeps a preset applied to its actor when the VOI range changes, as the legacy viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    const preset = CONSTANTS.VIEWPORT_PRESETS.find(
      ({ name }) => name === 'CT-Bone'
    );

    legacy.setProperties({ preset: 'CT-Bone' });
    utilities.applyPreset(volumeActorOf(next), preset);
    legacy.setProperties({ voiRange: { lower: 20, upper: 200 } });
    next.setDisplaySetPresentation({ voiRange: { lower: 20, upper: 200 } });

    expectSameTransferFunctions(next, legacy);
  });

  it('applies the preset key of the presentation and keeps it on a VOI change and on invert', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();
    const displaySetId = await showOnBoth(legacy, next, volumeId);

    legacy.setProperties({ preset: 'CT-Bone' });
    next.setDisplaySetPresentation(displaySetId, { preset: 'CT-Bone' });

    expectSameTransferFunctions(next, legacy);
    expect(next.getDisplaySetPresentation(displaySetId).preset).toBe('CT-Bone');

    legacy.setProperties({ voiRange: { lower: 20, upper: 200 } });
    next.setDisplaySetPresentation(displaySetId, {
      voiRange: { lower: 20, upper: 200 },
    });

    expectSameTransferFunctions(next, legacy);

    legacy.setProperties({ invert: true });
    next.setDisplaySetPresentation(displaySetId, { invert: true });

    expectSameTransferFunctions(next, legacy);
  });

  it('fires PRESET_MODIFIED with the legacy detail', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    const legacyDetails = recordEvents(legacy, Events.PRESET_MODIFIED);
    const nextDetails = recordEvents(next, Events.PRESET_MODIFIED);

    legacy.setProperties({ preset: 'CT-Bone' });
    next.setDisplaySetPresentation({ preset: 'CT-Bone' });

    expect(nextDetails.length).toBe(1);
    expect(nextDetails.length).toBe(legacyDetails.length);
    expect(nextDetails[0].viewportId).toBe(next.id);
    expect(nextDetails[0].volumeId).toBe(legacyDetails[0].volumeId);
    expect(nextDetails[0].presetName).toBe(legacyDetails[0].presetName);
    expect(nextDetails[0].actor).toBe(volumeActorOf(next));
  });

  it('applies a colormap name as the legacy viewport, and keeps it on a VOI change', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    legacy.setProperties({ colormap: { name: 'hsv' } });
    next.setDisplaySetPresentation({ colormap: { name: 'hsv' } });

    expectSameTransferFunctions(next, legacy);

    legacy.setProperties({ voiRange: { lower: 50, upper: 150 } });
    next.setDisplaySetPresentation({ voiRange: { lower: 50, upper: 150 } });

    expectSameTransferFunctions(next, legacy);
  });

  it('applies an opacity mapping and a threshold of the colormap as the legacy viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();
    const opacityMapping = [
      { value: 0, opacity: 0 },
      { value: 100, opacity: 0.4 },
      { value: 255, opacity: 0.9 },
    ];

    await showOnBoth(legacy, next, volumeId);

    legacy.setProperties({ colormap: { opacityMapping } });
    next.setDisplaySetPresentation({ colormap: { opacityMapping } });

    expectSameTransferFunctions(next, legacy);

    legacy.setProperties({ colormap: { threshold: 120 } });
    next.setDisplaySetPresentation({ colormap: { threshold: 120 } });

    expectSameTransferFunctions(next, legacy);
  });

  it('applies the sampled sigmoid VOI LUT function as the legacy viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    legacy.setProperties({ VOILUTFunction: 'SAMPLED_SIGMOID' });
    next.setDisplaySetPresentation({ voiLUTFunction: 'SAMPLED_SIGMOID' });
    legacy.setProperties({ voiRange: { lower: 40, upper: 160 } });
    next.setDisplaySetPresentation({ voiRange: { lower: 40, upper: 160 } });

    expectSameTransferFunctions(next, legacy);
  });

  it('applies the blend mode of the presentation as the blend mode of the legacy volume input', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await legacy.setVolumes([
      { volumeId, blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    ]);
    await showVolume(next, volumeId);
    next.setDisplaySetPresentation({
      blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
    });

    expect(volumeActorOf(next).getMapper().getBlendMode()).toBe(
      volumeActorOf(legacy).getMapper().getBlendMode()
    );
    expect(volumeActorOf(next).getMapper().getBlendMode()).toBe(
      BlendModes.MAXIMUM_INTENSITY_BLEND
    );
  });

  it('applies the interpolation type and the sample distance when no VOI range resolves', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const [{ rendering }] = next.getDebugBindings();
    const mapper = volumeActorOf(next).getMapper();
    const sampleDistance = mapper.getSampleDistance();

    rendering.defaultVOIRange = undefined;
    next.setDisplaySetPresentation({
      interpolationType: Enums.InterpolationType.NEAREST,
      sampleDistanceMultiplier: 4,
    });

    expect(volumeActorOf(next).getProperty().getInterpolationType()).toBe(
      Enums.InterpolationType.NEAREST
    );
    expect(mapper.getSampleDistance()).toBeGreaterThan(sampleDistance);
  });

  it('fires VOI_MODIFIED with the legacy detail on a VOI change and on invert', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    const legacyDetails = recordEvents(legacy, Events.VOI_MODIFIED);
    const nextDetails = recordEvents(next, Events.VOI_MODIFIED);

    legacy.setProperties({ voiRange: { lower: 30, upper: 90 } });
    next.setDisplaySetPresentation({ voiRange: { lower: 30, upper: 90 } });
    legacy.setProperties({ invert: true });
    next.setDisplaySetPresentation({ invert: true });

    expect(nextDetails.length).toBe(2);
    expect(nextDetails.length).toBe(legacyDetails.length);
    nextDetails.forEach((detail, index) => {
      const legacyDetail = legacyDetails[index];

      expect(detail.viewportId).toBe(next.id);
      expect(detail.volumeId).toBe(legacyDetail.volumeId);
      expectPointsClose(
        [detail.range.lower, detail.range.upper],
        [legacyDetail.range.lower, legacyDetail.range.upper]
      );
      expect(Boolean(detail.invert)).toBe(Boolean(legacyDetail.invert));
      expect(detail.invertStateChanged).toBe(legacyDetail.invertStateChanged);
      expect(detail.colormap?.name).toBe(legacyDetail.colormap?.name);
    });
  });

  it('fires VOI_MODIFIED and COLORMAP_MODIFIED with the legacy detail on a colormap change', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    const legacyVOI = recordEvents(legacy, Events.VOI_MODIFIED);
    const nextVOI = recordEvents(next, Events.VOI_MODIFIED);
    const legacyColormap = recordEvents(legacy, Events.COLORMAP_MODIFIED);
    const nextColormap = recordEvents(next, Events.COLORMAP_MODIFIED);

    legacy.setProperties({ colormap: { name: 'hsv' } });
    next.setDisplaySetPresentation({ colormap: { name: 'hsv' } });
    legacy.setProperties({ colormap: { threshold: 100 } });
    next.setDisplaySetPresentation({ colormap: { threshold: 100 } });

    expect(nextVOI.length).toBe(legacyVOI.length);
    expect(nextColormap.length).toBe(2);
    expect(nextColormap.length).toBe(legacyColormap.length);
    nextColormap.forEach((detail, index) => {
      expect(detail.viewportId).toBe(next.id);
      expect(detail.volumeId).toBe(volumeId);
      expect(detail.colormap.name).toBe(legacyColormap[index].colormap.name);
      expect(detail.colormap.threshold).toBe(
        legacyColormap[index].colormap.threshold
      );
    });
  });

  it('fires no presentation event with suppressEvents set', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const details = recordEvents(next, Events.VOI_MODIFIED);

    next.suppressEvents = true;
    next.setDisplaySetPresentation({ voiRange: { lower: 30, upper: 90 } });

    expect(details.length).toBe(0);
  });

  it('goes back to the presentation of the first mount on resetDisplaySetPresentation, and keeps the camera', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();
    const displaySetId = await showVolume(next, volumeId);
    const mountedColours = sampledColoursOf(next);
    const mountedOpacity = sampledOpacitiesOf(next);

    next.setDisplaySetPresentation(displaySetId, {
      preset: 'CT-Bone',
      voiRange: { lower: 20, upper: 60 },
      invert: true,
      opacity: 0.5,
    });

    const camera = next.getViewState();

    next.setViewState({ parallelScale: camera.parallelScale / 2 });

    const details = recordEvents(next, Events.VOI_MODIFIED);

    next.resetDisplaySetPresentation(displaySetId);

    expectPointsClose(sampledColoursOf(next), mountedColours);
    expectPointsClose(sampledOpacitiesOf(next), mountedOpacity);
    expect(next.getDisplaySetPresentation(displaySetId).preset).toBe(undefined);
    expect(next.getViewState().parallelScale).toBeCloseTo(
      camera.parallelScale / 2,
      6
    );
    expect(details.length).toBe(1);
  });
});

/** A vtk.js sphere of radius 100 around the origin. */
function createSphereActorEntry(uid = 'spherePolyData') {
  const sphereSource = vtkSphereSource.newInstance({
    center: [0, 0, 0],
    radius: 100,
    phiResolution: 10,
    thetaResolution: 10,
  });
  const actor = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();

  mapper.setInputConnection(sphereSource.getOutputPort());
  actor.setMapper(mapper);

  return { uid, actor };
}

/** Expects the camera of the next viewport to be the legacy camera. */
function expectSameCamera(nextCamera, legacyCamera) {
  expect(nextCamera.parallelScale).toBeCloseTo(legacyCamera.parallelScale, 4);
  expectPointsClose(nextCamera.focalPoint, legacyCamera.focalPoint);
  expectPointsClose(nextCamera.viewPlaneNormal, legacyCamera.viewPlaneNormal);
  expectPointsClose(nextCamera.viewUp, legacyCamera.viewUp);
}

describe('Direct next 3D viewport, the scene -- ', () => {
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

  it('adds and removes actors of the application as the legacy viewport, with ACTORS_CHANGED', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    const legacyDetails = recordEvents(legacy, Events.ACTORS_CHANGED);
    const nextDetails = recordEvents(next, Events.ACTORS_CHANGED);
    const legacySphere = createSphereActorEntry();
    const nextSphere = createSphereActorEntry();

    legacy.addActor(legacySphere);
    next.addActor(nextSphere);

    expect(next.getActors().length).toBe(legacy.getActors().length);
    expect(next.getActor('spherePolyData').actor).toBe(nextSphere.actor);
    expect(nextDetails.length).toBe(legacyDetails.length);
    expect(nextDetails[0].addedActors[0].uid).toBe('spherePolyData');
    expect(nextDetails[0].currentActors.length).toBe(
      legacyDetails[0].currentActors.length
    );

    legacy.removeActors(['spherePolyData']);
    next.removeActors(['spherePolyData']);

    expect(next.getActors().length).toBe(legacy.getActors().length);
    expect(next.getActor('spherePolyData')).toBe(undefined);
    expect(nextDetails.length).toBe(legacyDetails.length);
    expect(nextDetails[1].removedActors[0].uid).toBe('spherePolyData');
  });

  it('fires VOLUME_VIEWPORT_NEW_VOLUME once on a mount with the legacy detail', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();
    const legacyDetails = recordEvents(
      legacy,
      Events.VOLUME_VIEWPORT_NEW_VOLUME
    );
    const nextDetails = recordEvents(next, Events.VOLUME_VIEWPORT_NEW_VOLUME);

    await showOnBoth(legacy, next, volumeId);

    expect(nextDetails.length).toBe(1);
    expect(nextDetails.length).toBe(legacyDetails.length);
    expect(nextDetails[0].viewportId).toBe(next.id);
    expect(nextDetails[0].volumeActors.length).toBe(
      legacyDetails[0].volumeActors.length
    );
    expect(nextDetails[0].volumeActors[0].referencedId).toBe(
      legacyDetails[0].volumeActors[0].referencedId
    );
    expect(nextDetails[0].volumeActors[0].actor).toBe(volumeActorOf(next));
    expect(nextDetails[0].volumeActors[0].uid).toBe(next.getActors()[0].uid);
  });

  it('fits the actors of setActors on resetViewState as the legacy viewport on resetCamera, from the same view direction', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });

    legacy.setActors([createSphereActorEntry()]);
    next.setActors([createSphereActorEntry()]);

    const { viewUp, focalPoint, position } = legacy.getCamera();

    next.setViewState({ viewUp, focalPoint, position });
    legacy.setCamera({ parallelScale: legacy.getCamera().parallelScale / 2 });
    next.setViewState({ parallelScale: next.getViewState().parallelScale / 2 });
    legacy.resetCamera();
    next.resetViewState();

    expectSameCamera(next.getViewState(), legacy.getCamera());
    expect(next.getActors().length).toBe(1);
  });
});

/**
 * Makes a legacy and a direct next 3D viewport with `suppressEvents` in
 * their default options.
 */
function createSuppressedViewports(renderingEngine) {
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
        suppressEvents: true,
      },
    });
    rendering.useGenericViewport = useGenericViewport;

    return renderingEngine.getViewport(viewportId);
  });
}

describe('Direct next 3D viewport, the camera -- ', () => {
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

  it('gives and sets the zoom and the pan as the legacy viewport, from the fit of the mount and of a reset', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    expect(next.getZoom()).toBeCloseTo(1, 6);
    expectPointsClose(next.getPan(), [0, 0]);

    legacy.setZoom(2);
    next.setZoom(2);

    expect(next.getZoom()).toBeCloseTo(legacy.getZoom(), 6);
    expect(next.getViewState().parallelScale).toBeCloseTo(
      legacy.getCamera().parallelScale,
      4
    );

    legacy.setPan([20, -10]);
    next.setPan([20, -10]);

    expectPointsClose(next.getPan(), legacy.getPan(), 3);
    expectPointsClose(
      next.getViewState().focalPoint,
      legacy.getCamera().focalPoint
    );

    legacy.resetCamera();
    next.resetViewState();

    expect(next.getZoom()).toBeCloseTo(1, 6);
    expectPointsClose(next.getPan(), [0, 0]);
  });

  it('fires no CAMERA_MODIFIED with suppressEvents in the options, as the legacy viewport', async function () {
    const [legacy, next] = createSuppressedViewports(renderingEngine);
    const volumeId = await createVolume();

    await showOnBoth(legacy, next, volumeId);

    const legacyDetails = recordEvents(legacy, Events.CAMERA_MODIFIED);
    const nextDetails = recordEvents(next, Events.CAMERA_MODIFIED);
    const parallelScale = legacy.getCamera().parallelScale / 2;

    legacy.setCamera({ parallelScale });
    next.setViewState({ parallelScale });

    expect(next.suppressEvents).toBe(true);
    expect(nextDetails.length).toBe(legacyDetails.length);
    expect(nextDetails.length).toBe(0);
  });
});

describe('Direct next 3D viewport, volume members -- ', () => {
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

  it('answers hasImageURI and getIntensityFromWorld as the legacy viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();
    const otherVolumeId = await createVolume('otherVolume');

    await showOnBoth(legacy, next, volumeId);

    const imageURI = utilities.imageIdToURI(
      cache.getVolume(volumeId).imageIds[3]
    );
    const otherURI = utilities.imageIdToURI(
      cache.getVolume(otherVolumeId).imageIds[3]
    );

    expect(next.hasImageURI(imageURI)).toBe(legacy.hasImageURI(imageURI));
    expect(next.hasImageURI(imageURI)).toBe(true);
    expect(next.hasImageURI(otherURI)).toBe(legacy.hasImageURI(otherURI));

    const { focalPoint } = legacy.getCamera();

    [focalPoint, [2, 3, 4], [10, 12, 6]].forEach((point) => {
      expect(next.getIntensityFromWorld(point)).toBe(
        legacy.getIntensityFromWorld(point)
      );
    });
  });

  it('answers getVolumeId, getImageIds and getImageData for the volume asked for, as the legacy viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();
    const otherVolumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'otherVolume',
      id: 'otherVolume',
      rows: 20,
      columns: 24,
      slices: 6,
      xSpacing: 1.5,
      ySpacing: 1.5,
      zSpacing: 3,
    });

    await volumeLoader.createAndCacheVolume(otherVolumeId, { imageIds: [] });
    await legacy.setVolumes([{ volumeId }, { volumeId: otherVolumeId }]);
    await next.setDisplaySets(
      {
        displaySetId: addVolumeDisplaySet('next3D:first', volumeId),
        options: { renderMode: 'vtkVolume3d' },
      },
      {
        displaySetId: addVolumeDisplaySet('next3D:second', otherVolumeId),
        options: { renderMode: 'vtkVolume3d' },
      }
    );

    expect(next.getVolumeId({ volumeId: otherVolumeId })).toBe(otherVolumeId);
    expect(next.getVolumeId({ volumeId: otherVolumeId })).toBe(
      legacy.getVolumeId({ volumeId: otherVolumeId })
    );
    expect(next.getVolumeId({ volumeId: 'missing' })).toBe(
      legacy.getVolumeId({ volumeId: 'missing' })
    );
    expect(next.getVolumeId()).toBe(legacy.getVolumeId());
    expect(next.getImageIds(otherVolumeId)).toEqual(
      legacy.getImageIds(otherVolumeId)
    );
    expect(next.getImageIds()).toEqual(legacy.getImageIds());

    const nextImageData = next.getImageData(otherVolumeId);
    const legacyImageData = legacy.getImageData(otherVolumeId);

    expect(nextImageData.dimensions).toEqual(legacyImageData.dimensions);
    expectPointsClose(nextImageData.spacing, legacyImageData.spacing);
    expectPointsClose(nextImageData.origin, legacyImageData.origin);
    expect(next.getImageData().dimensions).toEqual(
      legacy.getImageData().dimensions
    );
  });
});

/** The class names and the kernels of the render passes of a viewport. */
function renderPassesOf(viewport) {
  const renderPasses = viewport.getRenderPasses();

  if (!renderPasses) {
    return null;
  }

  return renderPasses.map((renderPass) => [
    renderPass.getClassName(),
    Array.from(renderPass.getKernel?.() ?? []),
  ]);
}

describe('Direct next 3D viewport, sharpening and smoothing -- ', () => {
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

  it('gives the render passes of the legacy viewport for the sharpening and the smoothing of the presentation', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();
    const displaySetId = await showOnBoth(legacy, next, volumeId);

    expect(renderPassesOf(next)).toEqual(renderPassesOf(legacy));
    expect(renderPassesOf(next)).toBe(null);

    legacy.setProperties({ sharpening: 0.5, smoothing: 2 });
    next.setDisplaySetPresentation(displaySetId, {
      sharpening: 0.5,
      smoothing: 2,
    });

    expect(renderPassesOf(next).length).toBe(2);
    expect(renderPassesOf(next)).toEqual(renderPassesOf(legacy));
    expect(next.getDisplaySetPresentation(displaySetId).sharpening).toBe(0.5);

    legacy.setProperties({ smoothing: 0 });
    next.setDisplaySetPresentation(displaySetId, { smoothing: 0 });

    expect(renderPassesOf(next)).toEqual(renderPassesOf(legacy));
  });
});
