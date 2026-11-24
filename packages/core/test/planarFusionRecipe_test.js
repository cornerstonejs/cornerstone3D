import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  ctPresentation,
  petColorMapPresentation,
} from '../../../utils/demo/helpers/volumePresentationRecipes';

const { Enums, volumeLoader, utilities } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * What the legacy volume viewport (`58914567b`, 256 by 256, axial) drew with
 * `setVolumes` of the fusion of `createFusion`, the CT with
 * `setCtTransferFunctionForVolumeActor` and the PET with
 * `setPetColorMapTransferFunctionForVolumeActor`, as in the TMTV example:
 * the colour at x 4 mm, where the CT is below its window and draws black, at
 * y 4, 14, ... 484 mm. The PET there rises from 0 to 6 SUV along y, with 0
 * below y 31 mm. The slice opacity exponent of the legacy viewport is 0.125
 * for a z spacing of 10 mm (as for the PET and CT studies of the examples)
 * and 0.0625 for 10.2 mm.
 */
const LEGACY_PET_COLUMN = {
  0.125: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [64, 0, 8],
    [66, 0, 37],
    [67, 0, 53],
    [67, 0, 63],
    [62, 0, 68],
    [51, 0, 69],
    [41, 0, 70],
    [32, 0, 70],
    [22, 0, 71],
    [11, 0, 72],
    [1, 0, 73],
    [0, 10, 74],
    [0, 21, 74],
    [0, 32, 75],
    [0, 46, 76],
    [0, 58, 77],
    [0, 70, 78],
    [0, 79, 77],
    [0, 81, 66],
    [0, 82, 55],
    [0, 83, 44],
    [0, 84, 32],
    [0, 86, 18],
    [0, 87, 6],
    [7, 89, 0],
    [20, 90, 0],
    [34, 92, 0],
    [49, 94, 0],
    [64, 96, 0],
    [79, 98, 0],
    [100, 101, 0],
    [104, 91, 0],
    [108, 78, 0],
    [112, 65, 0],
    [117, 51, 0],
    [124, 36, 0],
    [134, 20, 0],
    [185, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
  ],
  0.0625: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [34, 0, 4],
    [35, 0, 20],
    [36, 0, 29],
    [36, 0, 34],
    [33, 0, 37],
    [27, 0, 37],
    [22, 0, 38],
    [17, 0, 38],
    [12, 0, 38],
    [6, 0, 39],
    [0, 0, 39],
    [0, 5, 40],
    [0, 11, 40],
    [0, 17, 41],
    [0, 25, 42],
    [0, 31, 42],
    [0, 38, 43],
    [0, 43, 42],
    [0, 44, 36],
    [0, 45, 30],
    [0, 46, 24],
    [0, 46, 18],
    [0, 47, 10],
    [0, 48, 3],
    [4, 49, 0],
    [11, 50, 0],
    [19, 51, 0],
    [27, 52, 0],
    [36, 54, 0],
    [44, 55, 0],
    [56, 57, 0],
    [59, 52, 0],
    [61, 44, 0],
    [64, 37, 0],
    [67, 29, 0],
    [72, 21, 0],
    [80, 12, 0],
    [121, 0, 0],
    [254, 0, 0],
    [254, 0, 0],
    [254, 0, 0],
    [254, 0, 0],
    [254, 0, 0],
    [254, 0, 0],
    [254, 0, 0],
    [254, 0, 0],
  ],
};

/** The z spacing of the fusion that gives each slice opacity exponent. */
const Z_SPACING = { 0.125: 10, 0.0625: 10.2 };

/**
 * The sample at y 404 mm reads 5.005 SUV, on the step of the opacity from
 * 0.81 to 1 at 5 SUV, where the two viewports interpolate differently.
 */
const STEP_ROW = 40;

/**
 * A CT of 64 by 64 by 48 voxels of 7.8125 mm whose values rise from -1000 to
 * 1000 along x, and a PET of 32 by 32 by 24 voxels of 15.625 mm whose SUV
 * rises from 0 to 6 along y, both with the same z extent.
 */
function createFusion(name, zSpacing) {
  const ctDims = [64, 64, 48];
  const ptDims = [32, 32, 24];
  const ctData = new Float32Array(ctDims[0] * ctDims[1] * ctDims[2]);
  const ptData = new Float32Array(ptDims[0] * ptDims[1] * ptDims[2]);

  for (let k = 0; k < ctDims[2]; k++) {
    for (let j = 0; j < ctDims[1]; j++) {
      for (let i = 0; i < ctDims[0]; i++) {
        ctData[i + ctDims[0] * (j + ctDims[1] * k)] = -1000 + (2000 * i) / 63;
      }
    }
  }
  for (let k = 0; k < ptDims[2]; k++) {
    for (let j = 0; j < ptDims[1]; j++) {
      for (let i = 0; i < ptDims[0]; i++) {
        ptData[i + ptDims[0] * (j + ptDims[1] * k)] = j < 3 ? 0 : (6 * j) / 31;
      }
    }
  }

  const ct = volumeLoader.createLocalVolume(`fusionRecipe-ct-${name}`, {
    dimensions: ctDims,
    spacing: [7.8125, 7.8125, zSpacing],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'fusion-frame' },
    scalarData: ctData,
  });
  const pt = volumeLoader.createLocalVolume(`fusionRecipe-pt-${name}`, {
    dimensions: ptDims,
    spacing: [15.625, 15.625, zSpacing * 2],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'PT', FrameOfReferenceUID: 'fusion-frame' },
    scalarData: ptData,
  });

  return { ct, pt };
}

/** The colours of the canvas at x 4 mm and y 4, 14, ... 484 mm. */
function readPetColumn(viewport) {
  const canvas = viewport.getCanvas();
  const ratio = window.devicePixelRatio || 1;
  const data = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height).data;

  return Array.from({ length: 49 }, (_, row) => {
    const [x, y] = viewport
      .worldToCanvas([4, 4 + row * 10, 235])
      .map((value) => Math.floor(value * ratio));
    const offset = (y * canvas.width + x) * 4;

    return [data[offset], data[offset + 1], data[offset + 2]];
  });
}

function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

describe('Planar presentation, the PET colormap recipe on a fusion -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    cornerstone3D.displaySetRegistry.clear();
  });

  Object.keys(LEGACY_PET_COLUMN).forEach((exponent) => {
    it(`draws the PET layer with petColorMapPresentation as the legacy volume viewport drew it with the callback, for a slice opacity exponent of ${exponent}`, async function () {
      const element = document.createElement('div');

      element.style.width = '256px';
      element.style.height = '256px';
      document.body.appendChild(element);
      renderingEngine.enableElement({
        viewportId: 'fusion',
        type: ViewportType.PLANAR,
        element,
        defaultOptions: { orientation: OrientationAxis.AXIAL },
      });

      const viewport = renderingEngine.getViewport('fusion');
      const { ct, pt } = createFusion(exponent, Z_SPACING[exponent]);

      cornerstone3D.displaySetRegistry.add('fusion-ct', {
        imageIds: ct.imageIds,
        volumeId: ct.volumeId,
      });
      cornerstone3D.displaySetRegistry.add('fusion-pt', {
        imageIds: pt.imageIds,
        volumeId: pt.volumeId,
      });
      await viewport.setDisplaySets(
        { displaySetId: 'fusion-ct' },
        { displaySetId: 'fusion-pt' }
      );
      viewport.setDisplaySetPresentation('fusion-ct', ctPresentation());
      viewport.setDisplaySetPresentation(
        'fusion-pt',
        petColorMapPresentation(undefined, Number(exponent))
      );
      await renderAndWait(viewport);

      const column = readPetColumn(viewport);

      LEGACY_PET_COLUMN[exponent].forEach((legacy, row) => {
        if (row === STEP_ROW) {
          return;
        }

        legacy.forEach((value, channel) => {
          expect(Math.abs(column[row][channel] - value)).toBeLessThanOrEqual(2);
        });
      });
    }, 60000);
  });
});
