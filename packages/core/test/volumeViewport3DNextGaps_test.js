import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import legacyValues from './fixtures/legacy3DViewportGaps.json';

const { Enums, volumeLoader, utilities, cache, CONSTANTS, viewportProjection } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events, BlendModes } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The colours and the opacities, sampled as `sampledColoursOf` and
 * `sampledOpacitiesOf` sample them, of the legacy 3D viewport with the
 * volume of the tests after `setProperties` with: the preset `CT-Bone`; then
 * a VOI range of 20 to 200; then invert; the colormap `hsv`; then a VOI
 * range of 50 to 150; the opacity mapping of the tests; then the threshold
 * 120; the sampled sigmoid VOI LUT function with a VOI range of 40 to 160.
 */
const LEGACY_TRANSFER_FUNCTIONS = legacyValues.transferFunctions;

/**
 * The render passes of the legacy 3D viewport, as `renderPassesOf` gives
 * them, with sharpening 0.5 and smoothing 2, and with the sharpening alone.
 * It had none before.
 */
const LEGACY_RENDER_PASSES = legacyValues.renderPasses;

/**
 * The camera of the legacy 3D viewport of 400 by 300 pixels, sagittal, with
 * the volume of the tests after `setVolumes`.
 */
const LEGACY_FIT_CAMERA = {
  parallelScale: 15,
  focalPoint: [15, 19.5, 11],
};

/**
 * The camera of the legacy 3D viewport with the sphere of the tests as its
 * only actor, after `setActors` and again after `resetCamera`.
 */
const LEGACY_SPHERE_CAMERA = {
  parallelScale: 100,
  focalPoint: [0, 0, 0],
  position: [1687.329395574948, 0, 0],
  viewPlaneNormal: [1, 0, 0],
  viewUp: [0, 0, 1],
};

/**
 * What `getBounds` of the legacy 3D viewport gave, the bounds of every
 * visible prop of its renderer: with the volume of the tests, with the volume
 * and the sphere of the tests, and with only a sphere of radius 5 around
 * [10, 20, 30].
 */
const LEGACY_BOUNDS = {
  volume: [-0.5, 29.5, -0.5, 39.5, -1, 23],
  volumeAndSphere: [
    -98.48077392578125, 98.48077392578125, -93.66078186035156,
    93.66078186035156, -100, 100,
  ],
  smallSphere: [
    5.075961112976074, 14.924038887023926, 15.31696081161499, 24.68303918838501,
    25, 35,
  ],
};

/**
 * Makes direct next 3D viewports of one size and orientation in one
 * rendering engine, one for each of `nextIds`.
 */
function createViewports(renderingEngine, { nextIds }) {
  const viewportOptions = {
    orientation: OrientationAxis.SAGITTAL,
    width: 400,
    height: 300,
    useEnableElement: true,
  };

  nextIds.forEach((viewportId) =>
    testUtils.createViewports(renderingEngine, {
      ...viewportOptions,
      viewportId,
      viewportType: ViewportType.VOLUME_3D,
    })
  );

  return nextIds.map((viewportId) => renderingEngine.getViewport(viewportId));
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
  cornerstone3D.displaySetRegistry.add(displaySetId, {
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
 * Expects the colours and the opacities of the next viewport to be those of
 * the legacy viewport, sampled over values: the nodes may sit elsewhere for
 * the same picture.
 */
function expectSameTransferFunctions(next, legacy) {
  expectPointsClose(sampledColoursOf(next), legacy.colours);
  expectPointsClose(sampledOpacitiesOf(next), legacy.opacities);
}

/**
 * What the two VOI_MODIFIED events of the legacy 3D viewport carried for
 * `setProperties` with a VOI range of 30 to 90 and then with invert.
 */
function legacyVoiModifiedDetails(volumeId) {
  return [
    {
      volumeId,
      range: { lower: 30, upper: 90 },
      invert: false,
      colormap: { name: 'Grayscale' },
    },
    {
      volumeId,
      range: { lower: 30, upper: 90 },
      invert: true,
      colormap: { name: 'Inverted-Grayscale' },
    },
  ];
}

/**
 * How many VOI_MODIFIED events the legacy 3D viewport fired for
 * `setProperties` with the colormap `hsv` and then with the colormap
 * threshold 100.
 */
const LEGACY_VOI_MODIFIED_COUNT_ON_COLORMAP = 1;

/**
 * The details of the two COLORMAP_MODIFIED events that the legacy 3D viewport
 * fired for `setProperties` with the colormap `hsv` and then with the
 * colormap threshold 100.
 */
const LEGACY_COLORMAP_MODIFIED_DETAILS = [
  { colormap: { name: 'hsv', threshold: null } },
  { colormap: { name: 'hsv', threshold: 100 } },
];

/**
 * The detail of the one VOLUME_VIEWPORT_NEW_VOLUME event of the legacy 3D
 * viewport at `setVolumes`: one volume actor, which names the volume.
 */
function legacyNewVolumeDetails(volumeId) {
  return [{ volumeActors: [{ referencedId: volumeId }] }];
}

/**
 * What the legacy 3D viewport gave after `setZoom(2)` and then
 * `setPan([20, -10])` from the fit of the volume: its zoom, its parallel
 * scale, its pan and its focal point.
 */
const LEGACY_ZOOM_AND_PAN = {
  zoom: 2,
  parallelScale: 7.5,
  pan: [20, -10],
  focalPoint: [15, 18.5, 10.5],
};

/**
 * The answers of `hasImageURI` of the legacy 3D viewport for the URI of an
 * image of its volume and of an image of another volume.
 */
const LEGACY_HAS_IMAGE_URI = { ownVolume: true, otherVolume: false };

/**
 * What `getIntensityFromWorld` of the legacy 3D viewport gave at its focal
 * point, at 2, 3, 4 and at 10, 12, 6.
 */
const LEGACY_INTENSITIES = [0, 0, 0];

/**
 * What the legacy 3D viewport with the volume of the tests and a second
 * volume of 20 by 24 by 6 voxels answered: no volume id for a volume that it
 * does not show, and the dimensions, the spacing and the origin of the image
 * data of each volume.
 */
const LEGACY_VOLUME_MEMBERS = {
  missingVolumeId: undefined,
  otherImageData: {
    dimensions: [20, 24, 6],
    spacing: [1.5, 1.5, 3],
    origin: [0, 0, 0],
  },
  dimensions: [30, 40, 12],
};

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
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const preset = CONSTANTS.VIEWPORT_PRESETS.find(
      ({ name }) => name === 'CT-Bone'
    );

    utilities.applyPreset(volumeActorOf(next), preset);
    next.setDisplaySetPresentation({ voiRange: { lower: 20, upper: 200 } });

    expectSameTransferFunctions(
      next,
      LEGACY_TRANSFER_FUNCTIONS.presetCtBoneVoiRange
    );
  });

  it('applies the preset key of the presentation and keeps it on a VOI change and on invert', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();
    const displaySetId = await showVolume(next, volumeId);

    next.setDisplaySetPresentation(displaySetId, { preset: 'CT-Bone' });

    expectSameTransferFunctions(next, LEGACY_TRANSFER_FUNCTIONS.presetCtBone);
    expect(next.getDisplaySetPresentation(displaySetId).preset).toBe('CT-Bone');

    next.setDisplaySetPresentation(displaySetId, {
      voiRange: { lower: 20, upper: 200 },
    });

    expectSameTransferFunctions(
      next,
      LEGACY_TRANSFER_FUNCTIONS.presetCtBoneVoiRange
    );

    next.setDisplaySetPresentation(displaySetId, { invert: true });

    expectSameTransferFunctions(
      next,
      LEGACY_TRANSFER_FUNCTIONS.presetCtBoneVoiRangeInverted
    );
  });

  it('applies a preset without PRESET_MODIFIED', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const nextDetails = recordEvents(
      next,
      'CORNERSTONE_VIEWPORT_RENDERING_PRESET_MODIFIED'
    );

    next.setDisplaySetPresentation({ preset: 'CT-Bone' });

    expect(nextDetails.length).toBe(0);
    expectSameTransferFunctions(next, LEGACY_TRANSFER_FUNCTIONS.presetCtBone);
  });

  it('applies a colormap name as the legacy viewport, and keeps it on a VOI change', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    next.setDisplaySetPresentation({ colormap: { name: 'hsv' } });

    expectSameTransferFunctions(next, LEGACY_TRANSFER_FUNCTIONS.colormapHsv);

    next.setDisplaySetPresentation({ voiRange: { lower: 50, upper: 150 } });

    expectSameTransferFunctions(
      next,
      LEGACY_TRANSFER_FUNCTIONS.colormapHsvVoiRange
    );
  });

  it('applies an opacity mapping and a threshold of the colormap as the legacy viewport', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();
    const opacityMapping = [
      { value: 0, opacity: 0 },
      { value: 100, opacity: 0.4 },
      { value: 255, opacity: 0.9 },
    ];

    await showVolume(next, volumeId);

    next.setDisplaySetPresentation({ colormap: { opacityMapping } });

    expectSameTransferFunctions(next, LEGACY_TRANSFER_FUNCTIONS.opacityMapping);

    next.setDisplaySetPresentation({ colormap: { threshold: 120 } });

    expectSameTransferFunctions(
      next,
      LEGACY_TRANSFER_FUNCTIONS.opacityMappingThreshold
    );
  });

  it('applies the sampled sigmoid VOI LUT function as the legacy viewport', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    next.setDisplaySetPresentation({ voiLUTFunction: 'SAMPLED_SIGMOID' });
    next.setDisplaySetPresentation({ voiRange: { lower: 40, upper: 160 } });

    expectSameTransferFunctions(next, LEGACY_TRANSFER_FUNCTIONS.sampledSigmoid);
  });

  it('applies the blend mode of the presentation as the blend mode of the legacy volume input', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);
    next.setDisplaySetPresentation({
      blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
    });

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

  it('fires VOI_MODIFIED with the legacy detail on a VOI change and on invert, with the invert of the display set and no invertStateChanged', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const legacyDetails = legacyVoiModifiedDetails(volumeId);
    const nextDetails = recordEvents(next, Events.VOI_MODIFIED);

    next.setDisplaySetPresentation({ voiRange: { lower: 30, upper: 90 } });
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
      expect(detail.invertStateChanged).toBeUndefined();
      expect(detail.colormap?.name).toBe(legacyDetail.colormap?.name);
    });
    expect(nextDetails[1].invert).toBe(true);
  });

  it('fires VOI_MODIFIED and COLORMAP_MODIFIED with the legacy detail on a colormap change', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const nextVOI = recordEvents(next, Events.VOI_MODIFIED);
    const legacyColormap = LEGACY_COLORMAP_MODIFIED_DETAILS;
    const nextColormap = recordEvents(next, Events.COLORMAP_MODIFIED);

    next.setDisplaySetPresentation({ colormap: { name: 'hsv' } });
    next.setDisplaySetPresentation({ colormap: { threshold: 100 } });

    expect(nextVOI.length).toBe(LEGACY_VOI_MODIFIED_COUNT_ON_COLORMAP);
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

/** A vtk.js sphere, of radius 100 around the origin unless told otherwise. */
function createSphereActorEntry(
  uid = 'spherePolyData',
  center = [0, 0, 0],
  radius = 100
) {
  const sphereSource = vtkSphereSource.newInstance({
    center,
    radius,
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

  it('has no registry of actors: a prop of the application goes to the renderer, and getActors lists the display sets only', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    for (const member of [
      'addActor',
      'addActors',
      'setActors',
      'removeActors',
      'getActor',
    ]) {
      expect(next[member]).toBeUndefined();
    }

    const details = recordEvents(next, 'CORNERSTONE_ACTORS_CHANGED');
    const { actor } = createSphereActorEntry();

    next.getRenderer().addActor(actor);
    next.render();

    expect(next.getRenderer().getActors()).toContain(actor);
    expect(next.getActors().length).toBe(1);
    expect(next.getActors()[0].referencedId).toBe(volumeId);
    expect(next.getDefaultActor().actor).toBe(volumeActorOf(next));

    next.getRenderer().removeActor(actor);

    expect(next.getRenderer().getActors()).not.toContain(actor);
    expect(details.length).toBe(0);
  });

  it('fires VOLUME_VIEWPORT_NEW_VOLUME once on a mount with the legacy detail', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();
    const legacyDetails = legacyNewVolumeDetails(volumeId);
    const nextDetails = recordEvents(next, Events.VOLUME_VIEWPORT_NEW_VOLUME);

    await showVolume(next, volumeId);

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

  it('fits a prop of the application in the renderer on resetViewState as the legacy viewport fits the actors of setActors on resetCamera, from the same view direction', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });

    next.getRenderer().addActor(createSphereActorEntry().actor);

    const { viewUp, focalPoint, position } = LEGACY_SPHERE_CAMERA;

    next.setViewState({ viewUp, focalPoint, position });
    next.setViewState({ parallelScale: next.getViewState().parallelScale / 2 });
    next.resetViewState();

    expectSameCamera(next.getViewState(), LEGACY_SPHERE_CAMERA);
    expect(next.getRenderer().getActors().length).toBe(1);
    expect(next.getActors().length).toBe(0);
  });

  it('gives the bounds of what it shows through getImageData and its renderer, where the legacy viewport has getBounds', async function () {
    const [next, props] = createViewports(renderingEngine, {
      nextIds: ['next3D', 'next3DProps'],
    });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    expectPointsClose(
      next.getImageData().imageData.getBounds(),
      LEGACY_BOUNDS.volume
    );
    expectPointsClose(
      [...next.getRenderer().computeVisiblePropBounds()],
      LEGACY_BOUNDS.volume
    );

    next.getRenderer().addActor(createSphereActorEntry().actor);

    expectPointsClose(
      [...next.getRenderer().computeVisiblePropBounds()],
      LEGACY_BOUNDS.volumeAndSphere
    );

    props
      .getRenderer()
      .addActor(createSphereActorEntry('smallSphere', [10, 20, 30], 5).actor);

    expectPointsClose(
      [...props.getRenderer().computeVisiblePropBounds()],
      LEGACY_BOUNDS.smallSphere
    );
  });
});

/**
 * The CAMERA_MODIFIED events that the legacy 3D viewport fired for
 * `setCamera` with `suppressEvents` in its default options.
 */
const LEGACY_SUPPRESSED_CAMERA_EVENT_COUNT = 0;

/**
 * Makes a direct next 3D viewport with `suppressEvents` in its default
 * options.
 */
function createSuppressedViewport(renderingEngine) {
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
      suppressEvents: true,
    },
  });

  return renderingEngine.getViewport('next3D');
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

  it('gives and sets the zoom and the pan through viewportProjection and through its four members with the result of the legacy members, from the fit of the mount and of a reset', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();
    const zoomPan = () => viewportProjection.getPresentation(next);
    const present = (presentation) =>
      next.setViewState(
        viewportProjection.withPresentation(next, presentation)
      );

    await showVolume(next, volumeId);

    expect(next.getZoom()).toBeCloseTo(1, 6);
    expectPointsClose(next.getPan(), [0, 0]);
    expect(zoomPan().zoom).toBeCloseTo(1, 6);
    expectPointsClose(zoomPan().pan, [0, 0]);

    present({ zoom: 2 });

    expect(zoomPan().zoom).toBeCloseTo(LEGACY_ZOOM_AND_PAN.zoom, 6);
    expect(next.getViewState().parallelScale).toBeCloseTo(
      LEGACY_ZOOM_AND_PAN.parallelScale,
      4
    );

    present({ pan: [10, -5] });

    expectPointsClose(
      zoomPan().pan.map((value) => value * zoomPan().zoom),
      LEGACY_ZOOM_AND_PAN.pan,
      3
    );
    expectPointsClose(
      next.getViewState().focalPoint,
      LEGACY_ZOOM_AND_PAN.focalPoint
    );

    next.resetViewState();

    expect(zoomPan().zoom).toBeCloseTo(1, 6);
    expectPointsClose(zoomPan().pan, [0, 0]);

    next.setZoom(LEGACY_ZOOM_AND_PAN.zoom);
    next.setPan(LEGACY_ZOOM_AND_PAN.pan);

    expect(next.getZoom()).toBeCloseTo(LEGACY_ZOOM_AND_PAN.zoom, 6);
    expect(next.getViewState().parallelScale).toBeCloseTo(
      LEGACY_ZOOM_AND_PAN.parallelScale,
      4
    );
    expectPointsClose(next.getPan(), LEGACY_ZOOM_AND_PAN.pan, 3);
    expectPointsClose(
      next.getViewState().focalPoint,
      LEGACY_ZOOM_AND_PAN.focalPoint
    );

    next.resetViewState();

    expect(next.getZoom()).toBeCloseTo(1, 6);
    expectPointsClose(next.getPan(), [0, 0]);
  });

  it('has no getProjectionSnapshot of its own, which nothing called', function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });

    expect(next.getProjectionSnapshot).toBeUndefined();
    expect(viewportProjection.getPresentation(next)).toBeDefined();
  });

  it('takes no storeAsInitialCamera in resetViewState: the zoom stays against the fit', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);
    next.setViewState({
      parallelScale: next.getViewState().parallelScale / 2,
    });
    next.resetViewState({ resetZoom: false, storeAsInitialCamera: true });

    expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(2, 6);
    expect('initialCamera' in next).toBe(false);
  });

  it('fires no CAMERA_MODIFIED with suppressEvents in the options, as the legacy viewport', async function () {
    const next = createSuppressedViewport(renderingEngine);
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const nextDetails = recordEvents(next, Events.CAMERA_MODIFIED);
    const parallelScale = LEGACY_FIT_CAMERA.parallelScale / 2;

    next.setViewState({ parallelScale });

    expect(next.suppressEvents).toBe(true);
    expect(nextDetails.length).toBe(LEGACY_SUPPRESSED_CAMERA_EVENT_COUNT);
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

  it('answers for an image URI through isReferenceViewable, where the legacy viewport has hasImageURI', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();
    const otherVolumeId = await createVolume('otherVolume');

    await showVolume(next, volumeId);

    const imageURI = utilities.imageIdToURI(
      cache.getVolume(volumeId).imageIds[3]
    );
    const otherURI = utilities.imageIdToURI(
      cache.getVolume(otherVolumeId).imageIds[3]
    );
    const holds = (referencedImageURI) =>
      next.isReferenceViewable(
        { referencedImageURI },
        { withNavigation: true }
      );

    expect(next.hasImageURI).toBeUndefined();
    expect(holds(imageURI)).toBe(LEGACY_HAS_IMAGE_URI.ownVolume);
    expect(holds(imageURI)).toBe(true);
    expect(holds(otherURI)).toBe(LEGACY_HAS_IMAGE_URI.otherVolume);
    expect(holds(otherURI)).toBe(false);
  });

  it('gives the value at a world point through getImageData, where the legacy viewport has getIntensityFromWorld', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const { focalPoint } = LEGACY_FIT_CAMERA;
    const { imageData, voxelManager } = next.getImageData();

    expect(next.getIntensityFromWorld).toBeUndefined();
    [focalPoint, [2, 3, 4], [10, 12, 6]].forEach((point, index) => {
      const value = voxelManager.getAtIJKPoint(
        utilities.transformWorldToIndex(imageData, point)
      );

      expect(typeof value).toBe('number');
      expect(value).toBe(LEGACY_INTENSITIES[index]);
    });
  });

  it('answers getVolumeId, getImageIds and getImageData for the volume asked for, as the legacy viewport', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
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
    expect(next.getVolumeId({ volumeId: otherVolumeId })).toBe(otherVolumeId);
    expect(next.getVolumeId({ volumeId: 'missing' })).toBe(
      LEGACY_VOLUME_MEMBERS.missingVolumeId
    );
    expect(next.getVolumeId()).toBe(volumeId);
    expect(next.getImageIds(otherVolumeId)).toEqual(
      cache.getVolume(otherVolumeId).imageIds
    );
    expect(next.getImageIds()).toEqual(cache.getVolume(volumeId).imageIds);

    const nextImageData = next.getImageData(otherVolumeId);
    const legacyImageData = LEGACY_VOLUME_MEMBERS.otherImageData;

    expect(nextImageData.dimensions).toEqual(legacyImageData.dimensions);
    expectPointsClose(nextImageData.spacing, legacyImageData.spacing);
    expectPointsClose(nextImageData.origin, legacyImageData.origin);
    expect(next.getImageData().dimensions).toEqual(
      LEGACY_VOLUME_MEMBERS.dimensions
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
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();
    const displaySetId = await showVolume(next, volumeId);

    expect(renderPassesOf(next)).toEqual(null);
    expect(renderPassesOf(next)).toBe(null);

    next.setDisplaySetPresentation(displaySetId, {
      sharpening: 0.5,
      smoothing: 2,
    });

    expect(renderPassesOf(next).length).toBe(2);
    expect(renderPassesOf(next)).toEqual(
      LEGACY_RENDER_PASSES.sharpeningAndSmoothing
    );
    expect(next.getDisplaySetPresentation(displaySetId).sharpening).toBe(0.5);

    next.setDisplaySetPresentation(displaySetId, { smoothing: 0 });

    expect(renderPassesOf(next)).toEqual(LEGACY_RENDER_PASSES.sharpening);
  });
});
