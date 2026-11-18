import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { applyCanvasSharpeningSmoothing } from '../src/RenderingEngine/GenericViewport/Planar/planarCanvasSharpeningSmoothing';
import * as stackSharpening05 from './groundTruth/planarSharpening_stack_sharpening_0_5.png';
import * as stackSharpening2 from './groundTruth/planarSharpening_stack_sharpening_2.png';
import * as stackSmoothing3 from './groundTruth/planarSharpening_stack_smoothing_3.png';
import * as stackSmoothing10 from './groundTruth/planarSharpening_stack_smoothing_10.png';
import * as stackBoth from './groundTruth/planarSharpening_stack_sharpening_1_and_smoothing_5.png';
import * as volumeSharpening05 from './groundTruth/planarSharpening_volume_sharpening_0_5.png';
import * as volumeSharpening2 from './groundTruth/planarSharpening_volume_sharpening_2.png';
import * as volumeSmoothing3 from './groundTruth/planarSharpening_volume_smoothing_3.png';
import * as volumeSmoothing10 from './groundTruth/planarSharpening_volume_smoothing_10.png';
import * as volumeBoth from './groundTruth/planarSharpening_volume_sharpening_1_and_smoothing_5.png';
import * as fusionSharpening05 from './groundTruth/planarSharpening_fusion_sharpening_0_5.png';
import * as fusionSharpening2 from './groundTruth/planarSharpening_fusion_sharpening_2.png';
import * as fusionSmoothing3 from './groundTruth/planarSharpening_fusion_smoothing_3.png';
import * as fusionSmoothing10 from './groundTruth/planarSharpening_fusion_smoothing_10.png';
import * as fusionBoth from './groundTruth/planarSharpening_fusion_sharpening_1_and_smoothing_5.png';
import * as stackPlain from './groundTruth/planarSharpening_stack_plain.png';
import * as volumePlain from './groundTruth/planarSharpening_volume_plain.png';
import * as fusionPlain from './groundTruth/planarSharpening_fusion_plain.png';
import legacyRenderPasses from './fixtures/legacySharpeningRenderPasses.json';
import { readStoredPicture } from './utils/storedPicture';

const { Enums, volumeLoader, imageLoader, utilities } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const SIZE = 128;
const VOI_RANGE = { lower: 0, upper: 255 };
const UPDATE_BASELINES = false;

/**
 * The pixels at the edge of the canvas that the comparisons leave out: the
 * half width of the 15 x 15 smoothing kernel. There the GPU pass reads
 * outside the drawn part of its framebuffer, which the CPU cannot know, and
 * the CPU repeats the edge pixels.
 */
const BORDER = 7;

/**
 * The largest difference of a colour channel, out of 255, that the next
 * picture may have from the legacy picture inside the border.
 */
const TOLERANCE = 3;

/** The settings of each picture, as the legacy `setProperties` takes them. */
const CASES = [
  ['sharpening 0.5', { sharpening: 0.5 }],
  ['sharpening 2', { sharpening: 2 }],
  ['smoothing 3', { smoothing: 3 }],
  ['smoothing 10', { smoothing: 10 }],
  ['sharpening 1 and smoothing 5', { sharpening: 1, smoothing: 5 }],
];

/** The expected picture of each scene and setting: the legacy picture. */
const EXPECTED = {
  stack: [
    stackSharpening05,
    stackSharpening2,
    stackSmoothing3,
    stackSmoothing10,
    stackBoth,
  ],
  volume: [
    volumeSharpening05,
    volumeSharpening2,
    volumeSmoothing3,
    volumeSmoothing10,
    volumeBoth,
  ],
  fusion: [
    fusionSharpening05,
    fusionSharpening2,
    fusionSmoothing3,
    fusionSmoothing10,
    fusionBoth,
  ],
};

/**
 * The picture of each legacy scene with no sharpening and no smoothing: the
 * legacy picture.
 */
const LEGACY_PLAIN = {
  stack: stackPlain,
  volume: volumePlain,
  fusion: fusionPlain,
};

/**
 * What `describeRenderPasses` gave for a legacy viewport with each setting
 * of `CASES`, the same for the stack, the volume and the fusion.
 */
const LEGACY_RENDER_PASSES = legacyRenderPasses;

/** The colormap of the second layer of the fusion. */
const FUSION_COLORMAP = {
  name: 'hsv',
  opacity: [
    { value: 0, opacity: 0 },
    { value: 255, opacity: 0.6 },
  ],
};

/**
 * The value of the picture at a column and row: a ramp at the top, then on
 * black a box with sharp edges, a vertical line and a horizontal line of one
 * pixel, and single dots.
 */
function patternValue(x, y) {
  if (y < 40) {
    return 2 * x;
  }

  if (x >= 70 && x < 100 && y >= 60 && y < 90) {
    return 255;
  }

  if (x === 30 && y >= 45 && y < 120) {
    return 255;
  }

  if (y === 100 && x >= 5 && x < 60) {
    return 180;
  }

  if (x % 8 === 4 && y % 8 === 4 && x > 100) {
    return 255;
  }

  return 0;
}

/** The value of the second layer of the fusion: two bands and a line. */
function bandValue(x, y) {
  return (y >= 50 && y < 54) || (y >= 110 && y < 112) || x === 64 ? 255 : 0;
}

function fill(voxelManager, value, slices = 1) {
  for (let k = 0; k < slices; k++) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        voxelManager.setAtIJK(x, y, k, value(x, y));
      }
    }
  }
}

/** Loads one image of the size of the viewport and gives it the pattern. */
async function createPatternImageIds(id) {
  const imageId = testUtils.encodeImageIdInfo({
    loader: 'fakeImageLoader',
    name: 'imageURI',
    id,
    rows: SIZE,
    columns: SIZE,
    barStart: 0,
    barWidth: 1,
    xSpacing: 1,
    ySpacing: 1,
  });
  const image = await imageLoader.loadAndCacheImage(imageId);

  fill(image.voxelManager, patternValue);

  return [imageId];
}

/**
 * Makes a volume of 5 slices of the size of the viewport, each slice with
 * `value`. Each test uses its own id: a volume id of an earlier test can
 * show the voxels of that test.
 */
async function createPatternVolume(id, value) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURIExact',
    id: `${id}-${utilities.uuidv4()}`,
    rows: SIZE,
    columns: SIZE,
    slices: 5,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
    exactRegion: {
      startRow: 0,
      endRow: 0,
      startColumn: 0,
      endColumn: 0,
      startSlice: 0,
      endSlice: 0,
      value: 0,
    },
  });
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: [],
  });

  fill(volume.voxelManager, value, 5);
  volume.modified();

  return volumeId;
}

/** Makes the volumes of a scene: the pattern, and the bands for a fusion. */
async function createSceneVolumes(fusion) {
  const volumeIds = [await createPatternVolume('pattern', patternValue)];

  if (fusion) {
    volumeIds.push(await createPatternVolume('bands', bandValue));
  }

  return volumeIds;
}

/**
 * Makes a viewport of the size of the picture on a black background. A
 * legacy type gives its legacy adapter.
 */
function createViewport(renderingEngine, viewportId, type, orientation) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: type,
    orientation,
    width: SIZE,
    height: SIZE,
    background: [0, 0, 0],
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/** The canvas that shows the viewport. */
function getShownCanvas(viewport) {
  return Array.from(viewport.element.querySelectorAll('canvas')).find(
    (canvas) => canvas.style.display !== 'none' && canvas.width
  );
}

/** The RGBA pixels of the shown canvas. */
function readPixels(viewport) {
  const canvas = getShownCanvas(viewport);

  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    .data;
}

/**
 * The largest difference of a colour channel between two pictures of the
 * size of the viewport, and the number of pixels that differ by more than
 * TOLERANCE, inside BORDER.
 */
function compareInside(a, b) {
  let max = 0;
  let over = 0;

  for (let y = BORDER; y < SIZE - BORDER; y++) {
    for (let x = BORDER; x < SIZE - BORDER; x++) {
      const index = (y * SIZE + x) * 4;
      let pixelMax = 0;

      for (let channel = 0; channel < 3; channel++) {
        pixelMax = Math.max(
          pixelMax,
          Math.abs(a[index + channel] - b[index + channel])
        );
      }

      max = Math.max(max, pixelMax);
      over += pixelMax > TOLERANCE ? 1 : 0;
    }
  }

  return { max, over };
}

/** The largest difference of a colour channel between two pictures. */
function maxDifference(a, b) {
  let max = 0;

  for (let i = 0; i < a.length; i++) {
    if (i % 4 !== 3) {
      max = Math.max(max, Math.abs(a[i] - b[i]));
    }
  }

  return max;
}

/** The class and the kernel of each render pass, or null. */
function describeRenderPasses(viewport) {
  const renderPasses = viewport.getRenderPasses();

  return (
    renderPasses &&
    renderPasses.map((renderPass) => [
      renderPass.getClassName(),
      renderPass.getKernelDimension?.(),
      Array.from(renderPass.getKernel?.() ?? []),
    ])
  );
}

function getCaseName(caseName) {
  return caseName.replace(/[ .]/g, '_');
}

async function showLegacyStack(renderingEngine) {
  const viewport = createViewport(
    renderingEngine,
    'legacy',
    ViewportType.STACK,
    OrientationAxis.ACQUISITION
  );

  await viewport.setStack(await createPatternImageIds('legacyPattern'), 0);
  viewport.setProperties({ voiRange: VOI_RANGE });
  await renderAndWait(viewport);

  return viewport;
}

async function showLegacyVolume(renderingEngine, fusion) {
  const viewport = createViewport(
    renderingEngine,
    'legacy',
    ViewportType.ORTHOGRAPHIC,
    OrientationAxis.AXIAL
  );
  const volumeIds = await createSceneVolumes(fusion);

  await viewport.setVolumes(volumeIds.map((volumeId) => ({ volumeId })));
  viewport.setProperties({ voiRange: VOI_RANGE }, volumeIds[0]);

  if (fusion) {
    viewport.setProperties(
      { voiRange: VOI_RANGE, colormap: FUSION_COLORMAP },
      volumeIds[1]
    );
  }

  await renderAndWait(viewport);

  return viewport;
}

/** Shows the stack of the pattern on a direct next planar viewport. */
async function showNextStack(renderingEngine, renderBackend) {
  const viewport = createViewport(
    renderingEngine,
    'next',
    ViewportType.PLANAR_NEXT,
    OrientationAxis.ACQUISITION
  );
  const displaySetId = `stack:${utilities.uuidv4()}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: await createPatternImageIds('nextPattern'),
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.ACQUISITION, renderBackend },
  });
  viewport.setDisplaySetPresentation(displaySetId, { voiRange: VOI_RANGE });
  await renderAndWait(viewport);

  return { viewport, displaySetId };
}

/**
 * Shows the volumes of a scene on a direct next planar viewport, axial: the
 * pattern as the source, the bands of a fusion as an overlay.
 */
async function showNextVolume(
  renderingEngine,
  fusion,
  options,
  viewportId = 'next'
) {
  const viewport = createViewport(
    renderingEngine,
    viewportId,
    ViewportType.PLANAR_NEXT,
    OrientationAxis.AXIAL
  );
  const volumeIds = await createSceneVolumes(fusion);
  const entries = volumeIds.map((volumeId, index) => {
    const displaySetId = `volume:${utilities.uuidv4()}`;

    utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
      imageIds: cornerstone3D.cache.getVolume(volumeId).imageIds,
      volumeId,
    });

    return {
      displaySetId,
      options: {
        ...options,
        orientation: OrientationAxis.AXIAL,
        ...(index ? { role: 'overlay' } : {}),
      },
    };
  });

  await viewport.setDisplaySets(...entries);
  viewport.setDisplaySetPresentation(entries[0].displaySetId, {
    voiRange: VOI_RANGE,
  });

  if (fusion) {
    viewport.setDisplaySetPresentation(entries[1].displaySetId, {
      voiRange: VOI_RANGE,
      colormap: FUSION_COLORMAP,
    });
  }

  await renderAndWait(viewport);

  return { viewport, displaySetId: entries[0].displaySetId };
}

const LEGACY_SCENES = {
  stack: (renderingEngine) => showLegacyStack(renderingEngine),
  volume: (renderingEngine) => showLegacyVolume(renderingEngine, false),
  fusion: (renderingEngine) => showLegacyVolume(renderingEngine, true),
};

/**
 * The reference of a direct next viewport: what a legacy scene drew, whose
 * pictures are the expected pictures and the plain picture, with the render
 * passes of the legacy viewport, or for the fusion the next viewport on the
 * GPU. The plain fusion of the next viewport differs from the legacy one
 * before any sharpening (the colormap with an opacity mapping draws
 * brighter), so a fusion on the CPU is compared with the fusion of the next
 * viewport on the GPU, and a fusion on the GPU only by its render passes.
 * `apply` takes a setting of `CASES`, or the setting with both at 0.
 */
async function showReference(renderingEngine, referenceName) {
  if (referenceName === 'nextFusion') {
    const { viewport, displaySetId } = await showNextVolume(
      renderingEngine,
      true,
      { renderBackend: 'gpu' },
      'reference'
    );

    return {
      apply: (properties) =>
        viewport.setDisplaySetPresentation(displaySetId, properties),
      render: () => renderAndWait(viewport),
      readPixels: () => readPixels(viewport),
      describeRenderPasses: () => describeRenderPasses(viewport),
    };
  }

  const plain = await readStoredPicture(LEGACY_PLAIN[referenceName].default);
  const pictures = await Promise.all(
    EXPECTED[referenceName].map((picture) => readStoredPicture(picture.default))
  );
  let caseIndex = -1;

  return {
    expected: EXPECTED[referenceName],
    sceneName: referenceName,
    apply: (properties) => {
      caseIndex = CASES.findIndex(
        ([, caseProperties]) => caseProperties === properties
      );
    },
    render: () => Promise.resolve(),
    readPixels: () => (caseIndex < 0 ? plain : pictures[caseIndex]).data,
    describeRenderPasses: () => LEGACY_RENDER_PASSES[caseIndex],
  };
}

/**
 * The direct next viewports: a name, the reference, how to show it, the
 * render mode of its source, and whether its picture is compared with the
 * reference.
 */
const NEXT_SCENES = [
  [
    'a stack image on the GPU',
    'stack',
    (renderingEngine) => showNextStack(renderingEngine, 'gpu'),
    'vtkImage',
    true,
  ],
  [
    'a slice cut on the CPU and drawn on the GPU',
    'volume',
    (renderingEngine) =>
      showNextVolume(renderingEngine, false, {
        renderBackend: 'gpu',
        sliceFirst: true,
      }),
    'vtkSampledSlice',
    true,
  ],
  [
    'a slice of the volume texture',
    'volume',
    (renderingEngine) =>
      showNextVolume(renderingEngine, false, {
        renderBackend: 'gpu',
        sliceFirst: false,
      }),
    'vtkVolumeSlice',
    true,
  ],
  [
    'a fusion on the GPU',
    'fusion',
    (renderingEngine) =>
      showNextVolume(renderingEngine, true, { renderBackend: 'gpu' }),
    'vtkSampledSlice',
    false,
  ],
  [
    'a stack image on the CPU',
    'stack',
    (renderingEngine) => showNextStack(renderingEngine, 'cpu'),
    'cpuImage',
    true,
  ],
  [
    'a volume slice on the CPU',
    'volume',
    (renderingEngine) =>
      showNextVolume(renderingEngine, false, { renderBackend: 'cpu' }),
    'cpuVolume',
    true,
  ],
  [
    'a fusion on the CPU',
    'nextFusion',
    (renderingEngine) =>
      showNextVolume(renderingEngine, true, { renderBackend: 'cpu' }),
    'cpuVolume',
    true,
  ],
];

describe('Sharpening and smoothing of the planar viewports -- ', () => {
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

  Object.entries(LEGACY_SCENES).forEach(([sceneName, show]) => {
    it(`draws the legacy ${sceneName} with each setting as the expected picture`, async function () {
      const viewport = await show(renderingEngine);
      const plain = readPixels(viewport);
      const volumeId = viewport.getVolumeId?.();

      for (const [index, [caseName, properties]] of CASES.entries()) {
        viewport.setProperties(properties, volumeId);
        await renderAndWait(viewport);

        expect(maxDifference(plain, readPixels(viewport))).toBeGreaterThan(20);
        await testUtils.compareImages(
          getShownCanvas(viewport).toDataURL('image/png'),
          EXPECTED[sceneName][index],
          `planarSharpening_${sceneName}_${getCaseName(caseName)}`,
          UPDATE_BASELINES
        );
        viewport.setProperties({ sharpening: 0, smoothing: 0 }, volumeId);
      }
    });
  });

  it('shows with sharpening and smoothing both above 0 the picture of the sharpening alone on the legacy viewport', async function () {
    const viewport = await showLegacyStack(renderingEngine);

    viewport.setProperties({ sharpening: 1, smoothing: 5 });
    await renderAndWait(viewport);
    const both = readPixels(viewport);

    viewport.setProperties({ sharpening: 1, smoothing: 0 });
    await renderAndWait(viewport);

    expect(maxDifference(both, readPixels(viewport))).toBe(0);
  });

  NEXT_SCENES.forEach(
    ([name, referenceName, showNext, renderMode, comparesPicture]) => {
      it(`draws ${name} on the direct next viewport as its reference, with each setting`, async function () {
        const reference = await showReference(renderingEngine, referenceName);
        const { viewport: next, displaySetId } =
          await showNext(renderingEngine);
        const drawsOnCpu = renderMode.startsWith('cpu');
        const plainNext = readPixels(next);
        const plain = compareInside(reference.readPixels(), plainNext);

        expect(next.getRenderPlan()[0].renderMode).toBe(renderMode);

        if (comparesPicture) {
          expect(plain.over).toBe(0);
        }

        expect(next.getRenderPasses()).toBe(null);

        for (const [index, [caseName, properties]] of CASES.entries()) {
          reference.apply(properties);
          next.setDisplaySetPresentation(displaySetId, properties);
          await reference.render();
          await renderAndWait(next);

          expect(next.getDisplaySetPresentation(displaySetId)).toEqual(
            jasmine.objectContaining(properties)
          );

          if (drawsOnCpu) {
            expect(next.getRenderPasses()).toBe(null);
          } else {
            expect(describeRenderPasses(next)).toEqual(
              reference.describeRenderPasses()
            );
          }

          const pixels = readPixels(next);
          const result = compareInside(reference.readPixels(), pixels);

          console.log(
            `[SHARPENING] ${name} ${caseName}: plain ${plain.max}, max ${result.max}, over ${result.over}`
          );
          expect(maxDifference(plainNext, pixels)).toBeGreaterThan(20);

          if (comparesPicture) {
            expect(result.over).toBe(0);
          }

          if (comparesPicture && reference.expected) {
            await testUtils.compareImages(
              getShownCanvas(next).toDataURL('image/png'),
              reference.expected[index],
              `planarSharpening_${reference.sceneName}_${getCaseName(caseName)}`
            );
          }

          reference.apply({ sharpening: 0, smoothing: 0 });
          next.setDisplaySetPresentation(displaySetId, {
            sharpening: 0,
            smoothing: 0,
          });
        }
      });
    }
  );

  it('runs no render pass and no convolution of the canvas when both are 0', async function () {
    const { viewport: gpu, displaySetId: gpuId } = await showNextStack(
      renderingEngine,
      'gpu'
    );

    expect(gpu.getRenderPasses()).toBe(null);
    gpu.setDisplaySetPresentation(gpuId, { sharpening: 0, smoothing: 0 });
    expect(gpu.getRenderPasses()).toBe(null);

    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;

    const { viewport: cpu, displaySetId: cpuId } = await showNextStack(
      renderingEngine,
      'cpu'
    );
    const plain = readPixels(cpu);
    const context = getShownCanvas(cpu).getContext('2d');
    const getImageData = spyOn(context, 'getImageData').and.callThrough();

    cpu.setDisplaySetPresentation(cpuId, { sharpening: 0, smoothing: 0 });
    await renderAndWait(cpu);
    expect(getImageData).not.toHaveBeenCalled();

    cpu.setDisplaySetPresentation(cpuId, { sharpening: 1 });
    await renderAndWait(cpu);
    expect(getImageData).toHaveBeenCalled();

    cpu.setDisplaySetPresentation(cpuId, { sharpening: 0 });
    await renderAndWait(cpu);
    expect(maxDifference(plain, readPixels(cpu))).toBe(0);
  });

  it('passes both keys through the setProperties of the planar legacy adapter', async function () {
    const legacy = await showLegacyStack(renderingEngine);
    const adapter = createViewport(
      renderingEngine,
      'adapter',
      ViewportType.STACK,
      OrientationAxis.ACQUISITION,
      true
    );

    await adapter.setStack(await createPatternImageIds('adapterPattern'), 0);
    adapter.setProperties({ voiRange: VOI_RANGE });
    await renderAndWait(adapter);

    for (const [caseName, properties] of CASES) {
      legacy.setProperties(properties);
      adapter.setProperties(properties);
      await renderAndWait(legacy);
      await renderAndWait(adapter);

      expect(adapter.getProperties()).toEqual(
        jasmine.objectContaining(properties)
      );
      expect(describeRenderPasses(adapter)).toEqual(
        describeRenderPasses(legacy)
      );

      const result = compareInside(readPixels(legacy), readPixels(adapter));

      console.log(
        `[SHARPENING] adapter ${caseName}: max ${result.max}, over ${result.over}`
      );
      expect(result.over).toBe(0);
      legacy.setProperties({ sharpening: 0, smoothing: 0 });
      adapter.setProperties({ sharpening: 0, smoothing: 0 });
    }
  });

  it('convolves a canvas of 512 and of 1024 pixels on the CPU in a measured time', function () {
    for (const size of [512, 1024]) {
      const canvas = document.createElement('canvas');

      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext('2d', { willReadFrequently: true });
      const gradient = context.createLinearGradient(0, 0, size, size);

      gradient.addColorStop(0, '#000');
      gradient.addColorStop(1, '#fff');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);

      for (const [caseName, properties] of [
        ['sharpening 1', { sharpening: 1 }],
        ['smoothing 5', { smoothing: 5 }],
      ]) {
        const start = performance.now();

        applyCanvasSharpeningSmoothing(canvas, context, properties);
        console.log(
          `[SHARPENING TIME] ${size} x ${size} ${caseName}: ${(
            performance.now() - start
          ).toFixed(1)} ms`
        );
      }
    }

    expect(true).toBe(true);
  });
});
