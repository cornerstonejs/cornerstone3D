// Shared fake-image-stack loader for vitest-browser GenericViewport state tests.
//
// Generalizes the single-slice fake loader pattern from
// tests/vitest-browser/genericStackApi.browser.test.ts to an N-slice stack.
// All pixel/metadata parameters are encoded directly into the imageId string
// so both the image loader and the metadata provider are pure functions of
// the imageId; this lets multiple fake stacks coexist safely and makes
// registration/unregistration trivial.

import {
  imageLoader as csImageLoader,
  metaData,
  utilities,
  type IImage,
  type Types,
} from '@cornerstonejs/core';

export const FAKE_IMAGE_LOADER_SCHEME = 'fakeImageLoader';

export interface FakeStackOptions {
  /** Namespaces imageIds so two stacks can coexist. Default 'stack'. */
  name?: string;
  rows?: number;
  columns?: number;
  barStart?: number;
  barWidth?: number;
  xSpacing?: number;
  ySpacing?: number;
  sliceCount?: number;
  frameOfReferenceUID?: string;
}

interface FakeImageIdInfo {
  name: string;
  rows: number;
  columns: number;
  barStart: number;
  barWidth: number;
  xSpacing: number;
  ySpacing: number;
  sliceIndex: number;
  frameOfReferenceUID: string;
}

const DEFAULT_OPTIONS: Required<FakeStackOptions> = {
  name: 'stack',
  rows: 64,
  columns: 64,
  barStart: 20,
  barWidth: 5,
  xSpacing: 1,
  ySpacing: 1,
  sliceCount: 5,
  frameOfReferenceUID: 'VITEST_FAKE_FRAME_OF_REFERENCE',
};

function encodeImageIdInfo(info: FakeImageIdInfo): string {
  return `${FAKE_IMAGE_LOADER_SCHEME}:${encodeURIComponent(JSON.stringify(info))}`;
}

function decodeImageIdInfo(imageId: string): FakeImageIdInfo | null {
  const colonIndex = imageId.indexOf(':');

  if (colonIndex < 0) {
    return null;
  }

  const scheme = imageId.slice(0, colonIndex);

  if (scheme !== FAKE_IMAGE_LOADER_SCHEME) {
    return null;
  }

  try {
    return JSON.parse(
      decodeURIComponent(imageId.slice(colonIndex + 1))
    ) as FakeImageIdInfo;
  } catch {
    return null;
  }
}

function fillVerticalBar(
  imageVoxelManager: Types.IVoxelManager<number>,
  rows: number,
  barStart: number,
  barWidth: number
) {
  for (let i = 0; i < rows; i++) {
    for (let j = barStart; j < barStart + barWidth; j++) {
      // Keep the same ijk write pattern as the Karma fake-image tests and the
      // reference genericStackApi.browser.test.ts.
      imageVoxelManager.setAtIJK(j, i, 0, 255);
    }
  }
}

function fakeImageLoader(imageId: string) {
  const info = decodeImageIdInfo(imageId);

  if (!info) {
    throw new Error(`Unsupported fake imageId: ${imageId}`);
  }

  const { rows, columns, barStart, barWidth, xSpacing, ySpacing, sliceIndex } =
    info;

  // Deterministic-but-distinct-per-slice background so probe/statistics
  // values are exactly computable by other suites.
  const backgroundValue = 10 + sliceIndex;
  const pixelData = new Uint8Array(rows * columns).fill(backgroundValue);
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
    FrameOfReferenceUID: info.frameOfReferenceUID,
    imageFrame: {
      photometricInterpretation: 'MONOCHROME2',
    },
  };

  return {
    promise: Promise.resolve(image),
  };
}

function makeFakeMetaDataProvider() {
  return function fakeMetaDataProvider(type: string, imageId: string) {
    const info = decodeImageIdInfo(imageId);

    if (!info) {
      return;
    }

    const { rows, columns, xSpacing, ySpacing, sliceIndex, frameOfReferenceUID, name } =
      info;

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
        seriesInstanceUID: `VITEST_FAKE_SERIES_${name}`,
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
        frameOfReferenceUID,
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
  };
}

export interface RegisteredFakeImageStack {
  imageIds: string[];
  options: Required<FakeStackOptions>;
  unregister(): void;
}

export function registerFakeImageStack(
  options?: FakeStackOptions
): RegisteredFakeImageStack {
  const resolved: Required<FakeStackOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // registerImageLoader is a plain scheme->fn assignment: safe to call
  // repeatedly, and this keeps the scheme registered even if a previous
  // test's cleanup called imageLoader.unregisterAllImageLoaders().
  csImageLoader.registerImageLoader(FAKE_IMAGE_LOADER_SCHEME, fakeImageLoader);

  const imageIds: string[] = [];

  for (let sliceIndex = 0; sliceIndex < resolved.sliceCount; sliceIndex++) {
    imageIds.push(
      encodeImageIdInfo({
        name: resolved.name,
        rows: resolved.rows,
        columns: resolved.columns,
        barStart: resolved.barStart,
        barWidth: resolved.barWidth,
        xSpacing: resolved.xSpacing,
        ySpacing: resolved.ySpacing,
        sliceIndex,
        frameOfReferenceUID: resolved.frameOfReferenceUID,
      })
    );
  }

  const provider = makeFakeMetaDataProvider();
  metaData.addProvider(provider, 10000);

  return {
    imageIds,
    options: resolved,
    unregister(): void {
      metaData.removeProvider(provider);
    },
  };
}
