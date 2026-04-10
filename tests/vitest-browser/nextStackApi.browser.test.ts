import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import {
  cache,
  Enums,
  getConfiguration,
  getRenderingEngine,
  imageLoader,
  init,
  metaData,
  type PlanarViewport,
  RenderingEngine,
  utilities,
  type IImage,
  type Types,
} from '@cornerstonejs/core';

const { Events, InterpolationType, OrientationAxis, ViewportType } = Enums;

const renderingEngineId = 'vitest-next-stack-rendering-engine';
const viewportId = 'vitest-next-stack-viewport';
const stackDataId = 'vitest-next-stack:primary';
const baselineName = 'next_imageURI_64_64_20_5_1_1_0_nearest';

const imageInfo = {
  loader: 'fakeImageLoader',
  name: 'imageURI',
  rows: 64,
  columns: 64,
  barStart: 20,
  barWidth: 5,
  xSpacing: 1,
  ySpacing: 1,
  sliceIndex: 0,
};

let previousUseViewportNext: boolean | undefined;

function encodeImageIdInfo(info: typeof imageInfo) {
  return `fakeImageLoader:${encodeURIComponent(JSON.stringify(info))}`;
}

function decodeImageIdInfo(imageId: string) {
  const [scheme, encodedInfo] = imageId.split(':');

  if (scheme !== 'fakeImageLoader') {
    return null;
  }

  return JSON.parse(decodeURIComponent(encodedInfo)) as typeof imageInfo;
}

function fillVerticalBar(
  imageVoxelManager: Types.IVoxelManager<number>,
  rows: number,
  barStart: number,
  barWidth: number
) {
  for (let i = 0; i < rows; i++) {
    for (let j = barStart; j < barStart + barWidth; j++) {
      // Keep the same ijk write pattern as the Karma fake-image tests.
      imageVoxelManager.setAtIJK(j, i, 0, 255);
    }
  }
}

function fakeImageLoader(imageId: string) {
  const info = decodeImageIdInfo(imageId);

  if (!info) {
    throw new Error(`Unsupported fake imageId: ${imageId}`);
  }

  const {
    rows,
    columns,
    barStart,
    barWidth,
    xSpacing,
    ySpacing,
  } = info;

  const pixelData = new Uint8Array(rows * columns);
  const imageVoxelManager = utilities.VoxelManager.createImageVoxelManager({
    height: rows,
    width: columns,
    numberOfComponents: 1,
    scalarData: pixelData,
  });

  fillVerticalBar(imageVoxelManager, rows, barStart, barWidth);

  const image: IImage = {
    rows,
    columns,
    width: columns,
    height: rows,
    imageId,
    intercept: 0,
    slope: 1,
    voxelManager: imageVoxelManager,
    invert: false,
    windowCenter: 40,
    windowWidth: 400,
    maxPixelValue: 255,
    minPixelValue: 0,
    rowPixelSpacing: ySpacing,
    columnPixelSpacing: xSpacing,
    getPixelData: () => imageVoxelManager.getScalarData(),
    sizeInBytes: rows * columns,
    FrameOfReferenceUID: 'Vitest_Stack_Frame_Of_Reference',
    imageFrame: {
      photometricInterpretation: 'MONOCHROME2',
    },
  };

  return {
    promise: Promise.resolve(image),
  };
}

function fakeMetaDataProvider(type: string, imageId: string) {
  const info = decodeImageIdInfo(imageId);

  if (!info) {
    return;
  }

  const { rows, columns, xSpacing, ySpacing, sliceIndex = 0 } = info;

  if (type === 'imagePixelModule') {
    return {
      photometricInterpretation: 'MONOCHROME2',
      rows,
      columns,
      samplesPerPixel: 1,
      bitsAllocated: 8,
      bitsStored: 8,
      highBit: 8,
      pixelRepresentation: 0,
    };
  }

  if (type === 'generalSeriesModule') {
    return {
      modality: 'MR',
    };
  }

  if (type === 'imagePlaneModule') {
    return {
      rows,
      columns,
      width: rows,
      height: columns,
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, sliceIndex],
      pixelSpacing: [xSpacing, ySpacing],
      rowPixelSpacing: ySpacing,
      columnPixelSpacing: xSpacing,
    };
  }

  if (type === 'voiLutModule') {
    return {
      windowWidth: undefined,
      windowCenter: undefined,
    };
  }

  if (type === 'modalityLutModule') {
    return {
      rescaleSlope: undefined,
      rescaleIntercept: undefined,
    };
  }
}

function waitForImageRendered(element: HTMLDivElement) {
  return new Promise<void>((resolve) => {
    element.addEventListener(
      Events.IMAGE_RENDERED,
      () => resolve(),
      { once: true }
    );
  });
}

async function renderNextStackViewport() {
  init();

  const renderingConfig = getConfiguration().rendering;
  previousUseViewportNext = renderingConfig.useViewportNext;
  renderingConfig.useViewportNext = true;

  imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
  metaData.addProvider(fakeMetaDataProvider, 10000);

  const renderingEngine = new RenderingEngine(renderingEngineId);
  const element = document.createElement('div');
  element.dataset.testid = 'next-stack-viewport';
  element.style.width = '400px';
  element.style.height = '400px';
  document.body.appendChild(element);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_V2,
    element,
    defaultOptions: {
      orientation: OrientationAxis.AXIAL,
      renderMode: 'vtkImage',
    },
  });

  const viewport = renderingEngine.getViewport(viewportId) as PlanarViewport;
  const imageId = encodeImageIdInfo(imageInfo);

  utilities.viewportNextDataSetMetadataProvider.add(stackDataId, {
    imageIds: [imageId],
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  await viewport.setDataList([
    {
      dataId: stackDataId,
      options: {
        renderMode: 'vtkImage',
      },
    },
  ]);

  viewport.setDataPresentation(stackDataId, {
    interpolationType: InterpolationType.NEAREST,
  });

  const rendered = waitForImageRendered(element);
  viewport.render();
  await rendered;

  return { element, viewport, renderingEngine };
}

afterEach(() => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  renderingEngine?.destroy();
  cache.purgeCache();
  metaData.removeProvider(fakeMetaDataProvider);
  imageLoader.unregisterAllImageLoaders();
  utilities.viewportNextDataSetMetadataProvider.clear?.();

  if (previousUseViewportNext !== undefined) {
    getConfiguration().rendering.useViewportNext = previousUseViewportNext;
  }

  document.body.innerHTML = '';
});

test('renders a fake-image stack with the Next stack API and matches the screenshot baseline', async () => {
  const { viewport } = await renderNextStackViewport();
  const canvas = viewport.getCanvas();

  expect(getConfiguration().rendering.useViewportNext).toBe(true);
  expect(viewport.type).toBe(ViewportType.PLANAR_V2);
  expect(viewport.constructor.name).toBe('PlanarViewport');

  await expect
    .element(page.elementLocator(canvas))
    .toMatchScreenshot(baselineName, {
      comparatorName: 'pixelmatch',
      comparatorOptions: {
        threshold: 0,
      },
    });
});
