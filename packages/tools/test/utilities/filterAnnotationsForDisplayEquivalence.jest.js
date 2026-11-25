import {
  cache,
  imageLoader,
  init,
  metaData,
  setRenderBackend,
  utilities,
  volumeLoader,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  jest,
} from '@jest/globals';
import VideoViewport from '../../../core/src/RenderingEngine/Viewports/Video/VideoViewport';
import WSIViewport from '../../../core/src/RenderingEngine/Viewports/WSI/WSIViewport';
import ECGViewport from '../../../core/src/RenderingEngine/Viewports/ECG/ECGViewport';
import { createPlanarViewportOnStandInEngine } from '../../../core/test/utils/planarViewportOnStandInEngine';
import {
  mountNext as mountWsi,
  unmount as unmountWsi,
  FRAME_OF_REFERENCE_UID as WSI_FRAME_OF_REFERENCE_UID,
} from '../../../core/test/utils/wsiStandIn';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../../utils/test/testUtilsImageLoader';
import filterAnnotationsForDisplay from '../../src/utilities/planar/filterAnnotationsForDisplay';

/**
 * Which annotations `filterAnnotationsForDisplay` keeps, for a mixed set on
 * each viewport family that shares it. The expected names are what the
 * filter kept before lane FX11 read the facts of the view once per filter
 * (`getReferenceViewableCheck`) instead of once per annotation: the change
 * must not change which annotations are drawn.
 */
const FRAME = 'equivalence-frame';
const AXIAL = [1, 0, 0, 0, 1, 0];
const TILT = Math.PI / 6;
const TILTED = [1, 0, 0, 0, Math.cos(TILT), Math.sin(TILT)];
const TILTED_NORMAL = [0, -Math.sin(TILT), Math.cos(TILT)];
const MULTIFRAME_URL = 'https://server/studies/1/series/2/instances/9';

const EXPECTED = {
  'regular@3:none': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
  ],
  'regular@3:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'contour-7',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'regular@3:asVolume': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'regular@4:none': [
    'canvas',
    'contour-4',
    'no-image-beyond',
    'no-image-within',
    'points-only',
    'range-4-to-5',
  ],
  'regular@4:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'contour-7',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'regular@4:asVolume': [
    'canvas',
    'contour-4',
    'no-image-beyond',
    'no-image-within',
    'plane-restriction-3',
    'points-only',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'regular@0:none': [
    'canvas',
    'contour-0',
    'no-image-beyond',
    'no-image-within',
    'points-only',
  ],
  'regular@0:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'contour-7',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'regular@0:asVolume': [
    'canvas',
    'contour-0',
    'no-image-beyond',
    'no-image-within',
    'plane-restriction-3',
    'points-only',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'irregular@2:none': [
    'canvas',
    'contour-2',
    'no-image-beyond',
    'no-image-within',
    'points-only',
    'range-1-to-3',
  ],
  'irregular@2:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'irregular@2:asVolume': [
    'canvas',
    'contour-2',
    'no-image-beyond',
    'no-image-within',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'irregular@3:none': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
  ],
  'irregular@3:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'irregular@3:asVolume': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'irregular@4:none': ['canvas', 'contour-4', 'points-only', 'range-4-to-5'],
  'irregular@4:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'other-display-set-1',
    'other-display-set-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'irregular@4:asVolume': [
    'canvas',
    'contour-4',
    'no-image-beyond',
    'no-image-within',
    'plane-restriction-3',
    'points-only',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'irregular@5:none': [
    'canvas',
    'contour-5',
    'points-only',
    'range-4-to-5',
    'volume-image-5',
  ],
  'irregular@5:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'other-display-set-1',
    'other-display-set-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'irregular@5:asVolume': [
    'canvas',
    'contour-5',
    'no-image-beyond',
    'no-image-within',
    'plane-restriction-3',
    'points-only',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
    'volume-no-image',
  ],
  'multiframe@3:none': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
  ],
  'multiframe@3:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'multiframe@3:asVolume': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'multiframe@1:none': [
    'canvas',
    'contour-1',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'points-only',
    'range-1-to-3',
  ],
  'multiframe@1:withNavigation': [
    'canvas',
    'contour-0',
    'contour-1',
    'contour-2',
    'contour-3',
    'contour-3-reversed-normal',
    'contour-4',
    'contour-5',
    'contour-6',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'other-display-set-3',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-image-5',
  ],
  'multiframe@1:asVolume': [
    'canvas',
    'contour-1',
    'no-image-beyond',
    'no-image-within',
    'other-display-set-1',
    'plane-restriction-3',
    'points-only',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'volume@3:none': ['canvas', 'contour-4', 'range-4-to-5'],
  'volume@3:withNavigation': [
    'canvas',
    'contour-4',
    'range-1-to-3',
    'range-4-to-5',
  ],
  'volume@3:asVolume': ['canvas', 'contour-4', 'range-4-to-5'],
  'volume@4:none': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'image-of-another-stack',
    'no-image-within',
    'not-a-number-3',
    'other-display-set-3',
    'other-frame-no-image',
    'plane-restriction-3',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'volume@4:withNavigation': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'image-of-another-stack',
    'no-image-within',
    'not-a-number-3',
    'other-display-set-3',
    'other-frame-no-image',
    'plane-restriction-3',
    'range-1-to-3',
    'range-4-to-5',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'volume@4:asVolume': [
    'canvas',
    'contour-3',
    'contour-3-other-frame',
    'contour-3-reversed-normal',
    'image-of-another-stack',
    'no-image-within',
    'not-a-number-3',
    'other-display-set-3',
    'other-frame-no-image',
    'plane-restriction-3',
    'range-1-to-3',
    'slice-index-3',
    'slice-index-3-no-display-set',
    'uri-3',
    'volume-no-image',
  ],
  'volume@0:none': ['canvas', 'contour-7'],
  'volume@0:withNavigation': [
    'canvas',
    'contour-7',
    'range-1-to-3',
    'range-4-to-5',
  ],
  'volume@0:asVolume': ['canvas', 'contour-7'],
  'video@1': ['frame-1', 'whole-video'],
  'video@5': ['frame-5', 'frames-3-to-9', 'whole-video'],
  'video@12': ['whole-video'],
  wsi: ['image-id', 'slide', 'slide-no-restriction'],
  'ecg:all-leads': ['lead-0', 'lead-2', 'record'],
  'ecg:without-lead-0': ['lead-2', 'record'],
};

/** Gives an element its size, as the browser would after layout. */
function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

function fakeImageId(name, sliceIndex, plane) {
  return `fakeImageLoader:${encodeURIComponent(
    JSON.stringify({
      loader: 'fakeImageLoader',
      name,
      rows: 16,
      columns: 16,
      barStart: 2,
      barWidth: 4,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
      ...plane,
    })
  )}`;
}

/** The fake image id of a frame of the multiframe instance. */
function toFakeImageId(imageId) {
  if (!imageId.startsWith('equivalenceFrames:')) {
    return imageId;
  }

  const frame = Number(imageId.split('/frames/')[1]);

  return fakeImageId('multiframe', frame - 1, {
    ipp: [0, 0, 2 * (frame - 1)],
    iop: AXIAL,
  });
}

function decodeFakeImageId(imageId) {
  if (!imageId.startsWith('fakeImageLoader:')) {
    return;
  }

  return JSON.parse(decodeURIComponent(imageId.split(':')[1]));
}

/**
 * The metadata of the images of the tests: the image plane of each image
 * with its orientation, position and frame of reference, and the other
 * modules of the fake metadata provider, also for the frames of the
 * multiframe instance.
 */
function equivalenceProvider(type, imageId) {
  if (typeof imageId !== 'string') {
    return;
  }

  const fakeId = toFakeImageId(imageId);
  const info = decodeFakeImageId(fakeId);

  if (!info?.iop) {
    return;
  }

  if (type === 'imagePlaneModule') {
    return {
      ...fakeMetaDataProvider(type, fakeId),
      imageOrientationPatient: info.iop,
      rowCosines: info.iop.slice(0, 3),
      columnCosines: info.iop.slice(3, 6),
      imagePositionPatient: info.ipp,
      frameOfReferenceUID: FRAME,
    };
  }

  return fakeMetaDataProvider(type, fakeId);
}

function equivalenceImageLoader(imageId) {
  return {
    promise: fakeImageLoader(toFakeImageId(imageId)).promise.then((image) => ({
      ...image,
      imageId,
      FrameOfReferenceUID: FRAME,
    })),
  };
}

/** The four corners of a square of the plane of an image, 8 mm wide. */
function squareOnPlane(ipp, iop) {
  const row = iop.slice(0, 3);
  const column = iop.slice(3, 6);

  return [
    [4, 4],
    [12, 4],
    [12, 12],
    [4, 12],
  ].map(([r, c]) =>
    ipp.map((value, axis) => value + r * row[axis] + c * column[axis])
  );
}

function contour(name, metadata, polyline) {
  return {
    annotationUID: name,
    isVisible: true,
    isLocked: true,
    invalidated: false,
    highlighted: false,
    metadata: {
      toolName: 'PlanarFreehandContourSegmentationTool',
      FrameOfReferenceUID: FRAME,
      ...metadata,
    },
    data: {
      contour: { closed: true, polyline },
      segmentation: { segmentationId: 'rt', segmentIndex: 1 },
      handles: {},
    },
  };
}

function measurement(name, metadata, points, extra = {}) {
  return {
    annotationUID: name,
    isVisible: true,
    isLocked: false,
    invalidated: false,
    highlighted: false,
    metadata: { toolName: 'Length', ...metadata },
    data: { handles: { points }, ...extra },
  };
}

/** The names of the annotations that the filter keeps, sorted. */
function kept(viewport, annotations, options) {
  return filterAnnotationsForDisplay(viewport, annotations, options)
    .map((annotation) => annotation.annotationUID)
    .sort();
}

const OPTIONS = {
  none: {},
  withNavigation: { withNavigation: true },
  asVolume: { asVolume: true },
};

describe('filterAnnotationsForDisplay keeps the annotations that it kept before lane FX11', () => {
  let renderingEngine;

  beforeAll(() => {
    window.devicePixelRatio = 1;
    init({});
  });

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    displaySetRegistry.clear();
    metaData.removeAllProviders();
  });

  function record(key, value) {
    expect(value).toEqual(EXPECTED[key]);
  }

  function createPlanarViewport(id) {
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', equivalenceImageLoader);
    imageLoader.registerImageLoader(
      'equivalenceFrames',
      equivalenceImageLoader
    );
    metaData.addProvider(equivalenceProvider, 20000);

    const element = document.createElement('div');

    document.body.appendChild(element);
    setSize(element, 64, 64);

    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      id
    ));

    return viewport;
  }

  async function mountStack(id, planes) {
    const viewport = createPlanarViewport(id);
    const imageIds = planes.map(
      (plane, index) => plane.imageId ?? fakeImageId(id, index, plane)
    );

    displaySetRegistry.add(id, { imageIds });
    await viewport.setDisplaySets({
      displaySetId: id,
      options: { mode: 'stack', initialImageIdIndex: 0 },
    });

    return { viewport, imageIds };
  }

  /**
   * The mixed set on the images of a stack: contours of an RTSTRUCT on the
   * slices, measurements made on the stack, references without an image,
   * with another frame of reference, of another display set or of the
   * volume of the images, over a range of slices, hidden, on the canvas, and
   * with a point that is not a number.
   */
  function mixedSet(viewport, imageIds, planes, displaySetId) {
    const annotations = [];
    const { ipp: ipp3, iop: iop3 } = planes[3];
    const normalOf = (iop) => {
      const [a, b, c, d, e, f] = iop;

      return [b * f - c * e, c * d - a * f, a * e - b * d];
    };

    planes.forEach(({ ipp, iop }, index) => {
      annotations.push(
        contour(
          `contour-${index}`,
          {
            referencedImageId: imageIds[index],
            viewPlaneNormal: normalOf(iop),
          },
          squareOnPlane(ipp, iop)
        )
      );
    });

    const normal3 = normalOf(iop3);
    const shifted = (distance) =>
      ipp3.map((value, axis) => value + distance * normal3[axis]);

    annotations.push(
      contour(
        'contour-3-reversed-normal',
        {
          referencedImageId: imageIds[3],
          viewPlaneNormal: normal3.map((value) => -value),
        },
        squareOnPlane(ipp3, iop3)
      ),
      contour(
        'contour-3-other-frame',
        {
          referencedImageId: imageIds[3],
          viewPlaneNormal: normal3,
          FrameOfReferenceUID: 'other-frame',
        },
        squareOnPlane(ipp3, iop3)
      ),
      contour(
        'no-image-within',
        { viewPlaneNormal: normal3, cameraFocalPoint: shifted(0.3) },
        squareOnPlane(shifted(0.3), iop3)
      ),
      contour(
        'no-image-beyond',
        { viewPlaneNormal: normal3, cameraFocalPoint: shifted(1.7) },
        squareOnPlane(shifted(1.7), iop3)
      ),
      contour(
        'other-frame-no-image',
        {
          viewPlaneNormal: normal3,
          cameraFocalPoint: ipp3,
          FrameOfReferenceUID: 'other-frame',
        },
        squareOnPlane(ipp3, iop3)
      ),
      measurement(
        'points-only',
        { FrameOfReferenceUID: FRAME },
        squareOnPlane(shifted(0.3), iop3).slice(0, 2)
      ),
      measurement(
        'volume-image-5',
        {
          FrameOfReferenceUID: FRAME,
          volumeId: `cornerstoneStreamingImageVolume:${displaySetId}`,
          displaySetId,
          referencedImageId: imageIds[5],
          viewPlaneNormal: normalOf(planes[5].iop),
          cameraFocalPoint: planes[5].ipp,
          sliceIndex: 5,
        },
        squareOnPlane(planes[5].ipp, planes[5].iop).slice(0, 2)
      ),
      measurement(
        'volume-no-image',
        {
          FrameOfReferenceUID: FRAME,
          volumeId: `cornerstoneStreamingImageVolume:${displaySetId}`,
          viewPlaneNormal: normal3,
          cameraFocalPoint: ipp3,
          sliceIndex: 3,
        },
        squareOnPlane(ipp3, iop3).slice(0, 2)
      ),
      measurement(
        'other-display-set-3',
        {
          FrameOfReferenceUID: FRAME,
          displaySetId: 'other-display-set',
          referencedImageId: imageIds[3],
          viewPlaneNormal: normal3,
        },
        squareOnPlane(ipp3, iop3).slice(0, 2)
      ),
      measurement(
        'other-display-set-1',
        {
          FrameOfReferenceUID: FRAME,
          displaySetId: 'other-display-set',
          referencedImageId: imageIds[1],
          viewPlaneNormal: normalOf(planes[1].iop),
        },
        squareOnPlane(planes[1].ipp, planes[1].iop).slice(0, 2)
      ),
      measurement(
        'range-1-to-3',
        {
          FrameOfReferenceUID: FRAME,
          referencedImageId: imageIds[1],
          viewPlaneNormal: normalOf(planes[1].iop),
          multiSliceReference: { referencedImageId: imageIds[3] },
        },
        squareOnPlane(planes[1].ipp, planes[1].iop).slice(0, 2)
      ),
      measurement(
        'range-4-to-5',
        {
          FrameOfReferenceUID: FRAME,
          referencedImageId: imageIds[4],
          viewPlaneNormal: normalOf(planes[4].iop),
          multiSliceReference: { referencedImageId: imageIds[5] },
        },
        squareOnPlane(planes[4].ipp, planes[4].iop).slice(0, 2)
      ),
      measurement(
        'uri-3',
        {
          FrameOfReferenceUID: FRAME,
          referencedImageURI: utilities.imageIdToURI(imageIds[3]),
        },
        squareOnPlane(ipp3, iop3).slice(0, 2)
      ),
      measurement(
        'slice-index-3',
        { FrameOfReferenceUID: FRAME, displaySetId, sliceIndex: 3 },
        squareOnPlane(ipp3, iop3).slice(0, 2)
      ),
      measurement(
        'slice-index-3-no-display-set',
        { FrameOfReferenceUID: FRAME, sliceIndex: 3 },
        squareOnPlane(ipp3, iop3).slice(0, 2)
      ),
      measurement(
        'plane-restriction-3',
        {
          FrameOfReferenceUID: FRAME,
          planeRestriction: {
            FrameOfReferenceUID: FRAME,
            point: ipp3,
            inPlaneVector1: iop3.slice(0, 3),
            inPlaneVector2: iop3.slice(3, 6),
          },
        },
        squareOnPlane(ipp3, iop3).slice(0, 2)
      ),
      measurement(
        'image-of-another-stack',
        {
          FrameOfReferenceUID: FRAME,
          referencedImageId: fakeImageId('another-stack', 3, planes[3]),
          viewPlaneNormal: normal3,
        },
        squareOnPlane(ipp3, iop3).slice(0, 2)
      ),
      measurement(
        'not-a-number-3',
        {
          FrameOfReferenceUID: FRAME,
          referencedImageId: imageIds[3],
          cameraFocalPoint: [Number.NaN, 0, 0],
        },
        squareOnPlane(ipp3, iop3).slice(0, 2)
      ),
      measurement('canvas', { FrameOfReferenceUID: 'other-frame' }, [], {
        isCanvasAnnotation: true,
      }),
      {
        ...measurement(
          'hidden-3',
          { FrameOfReferenceUID: FRAME, referencedImageId: imageIds[3] },
          squareOnPlane(ipp3, iop3).slice(0, 2)
        ),
        isVisible: false,
      }
    );

    return annotations;
  }

  /**
   * Shows each slice of the probes and records the kept names for each set
   * of options. The set is made again for each probe, as the volume path
   * writes a normal into annotations that have none.
   */
  async function probe(scenario, viewport, slices, makeSet) {
    for (const sliceIndex of slices) {
      await viewport.setImageIdIndex(sliceIndex);

      Object.entries(OPTIONS).forEach(([label, options]) => {
        record(
          `${scenario}@${sliceIndex}:${label}`,
          kept(viewport, makeSet(), options)
        );
      });
    }
  }

  const REGULAR = Array.from({ length: 8 }, (_, index) => ({
    ipp: [0, 0, index],
    iop: AXIAL,
  }));
  const IRREGULAR = [0, 1, 3, 6].map((z) => ({ ipp: [0, 0, z], iop: AXIAL }));

  IRREGULAR.push(
    { ipp: [0, 0, 10], iop: TILTED },
    {
      ipp: [0, 0, 10].map((value, axis) => value + 2 * TILTED_NORMAL[axis]),
      iop: TILTED,
    },
    { ipp: [0, 0, 14], iop: AXIAL }
  );

  const MULTIFRAME = Array.from({ length: 7 }, (_, index) => ({
    imageId: `equivalenceFrames:${MULTIFRAME_URL}/frames/${index + 1}`,
    ipp: [0, 0, 2 * index],
    iop: AXIAL,
  }));

  it('on a stack of parallel images, one per millimetre', async () => {
    const { viewport, imageIds } = await mountStack('regular', REGULAR);

    await probe('regular', viewport, [3, 4, 0], () =>
      mixedSet(viewport, imageIds, REGULAR, 'regular')
    );
  });

  it('on a stack whose images are not parallel nor equally spaced', async () => {
    const { viewport, imageIds } = await mountStack('irregular', IRREGULAR);

    await probe('irregular', viewport, [2, 3, 4, 5], () =>
      mixedSet(viewport, imageIds, IRREGULAR, 'irregular')
    );
  });

  it('on a stack of the frames of a multiframe image', async () => {
    const { viewport, imageIds } = await mountStack('multiframe', MULTIFRAME);

    await probe('multiframe', viewport, [3, 1], () => [
      ...mixedSet(viewport, imageIds, MULTIFRAME, 'multiframe'),
      measurement(
        'instance-without-frame',
        {
          FrameOfReferenceUID: FRAME,
          referencedImageURI: MULTIFRAME_URL,
        },
        squareOnPlane(MULTIFRAME[3].ipp, AXIAL).slice(0, 2)
      ),
    ]);
  });

  it('on the same images in volume mode', async () => {
    const viewport = createPlanarViewport('volume');
    const imageIds = REGULAR.map((plane, index) =>
      fakeImageId('regular', index, plane)
    );
    const volumeId = 'cornerstoneStreamingImageVolume:regular';

    await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
    displaySetRegistry.add('regular', { imageIds, volumeId });
    await viewport.setDisplaySets({
      displaySetId: 'regular',
      options: { mode: 'volume', initialImageIdIndex: 0 },
    });

    await probe('volume', viewport, [3, 4, 0], () =>
      mixedSet(viewport, imageIds, REGULAR, 'regular')
    );
  });

  it('on a video', async () => {
    const videoId = 'wadors:https://server/studies/1/series/2/instances/3';
    const element = document.createElement('div');

    Object.defineProperty(element, 'clientWidth', { value: 400 });
    Object.defineProperty(element, 'clientHeight', { value: 300 });
    document.body.appendChild(element);

    const viewport = new VideoViewport({
      id: 'video',
      element,
      renderingEngineId: 'renderingEngine',
      dataProvider: {
        load: async (id) => ({
          id,
          type: 'video',
          renderedUrl: 'https://server/video.mp4',
          fps: 10,
          numberOfFrames: 50,
          frameRange: [1, 50],
          modality: 'XC',
          metadata: {
            bitsAllocated: 8,
            numberOfComponents: 3,
            origin: [0, 0, 0],
            rows: 100,
            columns: 200,
            direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            dimensions: [200, 100, 1],
            spacing: [1, 1, 1],
            hasPixelSpacing: false,
            numVoxels: 20000,
            imagePlaneModule: {},
          },
        }),
      },
    });
    const mounted = viewport.setDisplaySets({
      displaySetId: `${videoId}/frames/1`,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const video = element.querySelector('video');

    Object.defineProperty(video, 'videoWidth', { value: 200 });
    Object.defineProperty(video, 'videoHeight', { value: 100 });
    Object.defineProperty(video, 'duration', { value: 5 });
    Object.defineProperty(video, 'readyState', { value: 4 });
    let currentTime = 0;

    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: (value) => {
        currentTime = value;
      },
    });
    Object.defineProperty(video, 'paused', { get: () => true });
    video.play = jest.fn(() => Promise.resolve());
    video.pause = jest.fn();
    video.dispatchEvent(new Event('loadedmetadata'));
    await mounted;

    const reference = viewport.getViewReference();

    viewport.setFrameNumber(5);

    const referenceOfFrame5 = viewport.getViewReference();
    const base = {
      FrameOfReferenceUID: reference.FrameOfReferenceUID,
      viewPlaneNormal: reference.viewPlaneNormal,
    };
    const points = [
      [20, 20, 0],
      [60, 40, 0],
    ];
    const makeSet = () => [
      measurement('frame-1', { ...reference }, points),
      measurement('frame-5', { ...referenceOfFrame5 }, points),
      measurement(
        'frames-3-to-9',
        { ...base, referencedImageId: `${videoId}/frames/3-9` },
        points
      ),
      measurement(
        'whole-video',
        { ...base, referencedImageId: videoId },
        points
      ),
      measurement(
        'other-normal',
        { ...reference, viewPlaneNormal: [1, 0, 0] },
        points
      ),
      measurement(
        'other-frame-of-reference',
        { ...reference, FrameOfReferenceUID: 'other-frame' },
        points
      ),
    ];

    for (const frame of [1, 5, 12]) {
      viewport.setFrameNumber(frame);
      record(
        `video@${viewport.getFrameNumber()}`,
        kept(viewport, makeSet(), {})
      );
    }

    viewport.destroy();
    element.remove();
  });

  it('on a whole slide image', async () => {
    const mounted = await mountWsi(WSIViewport, 0.4);
    const base = {
      FrameOfReferenceUID: WSI_FRAME_OF_REFERENCE_UID,
      cameraFocalPoint: [260, 520, 0],
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, -1, 0],
      sliceIndex: 0,
    };
    const points = [
      [260, 520, 0],
      [300, 560, 0],
    ];
    const restriction = {
      FrameOfReferenceUID: WSI_FRAME_OF_REFERENCE_UID,
      point: [260, 520, 0],
      inPlaneVector1: [0, -1, 0],
      inPlaneVector2: [-1, 0, 0],
    };
    const annotations = [
      measurement('slide', { ...base, planeRestriction: restriction }, points),
      measurement('slide-no-restriction', { ...base }, points),
      measurement(
        'other-frame-of-reference',
        {
          ...base,
          FrameOfReferenceUID: '9.9.9',
          planeRestriction: { ...restriction, FrameOfReferenceUID: '9.9.9' },
        },
        points
      ),
      measurement(
        'other-plane',
        {
          ...base,
          planeRestriction: { ...restriction, point: [260, 520, 5] },
        },
        points
      ),
      measurement(
        'image-id',
        {
          FrameOfReferenceUID: WSI_FRAME_OF_REFERENCE_UID,
          referencedImageId:
            'wadors:https://server/studies/1/series/2/instances/3',
        },
        points
      ),
    ];

    record('wsi', kept(mounted.viewport, annotations, {}));
    unmountWsi(mounted);
  });

  it('on an ECG', async () => {
    const samples = 5000;
    const element = document.createElement('div');

    document.body.appendChild(element);

    const viewport = new ECGViewport({
      id: 'ecg',
      element,
      renderingEngineId: 're',
      dataProvider: {
        load: async () => ({
          id: 'ecg:1',
          type: 'ecg',
          channels: ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'].map((name) => ({
            name,
            data: new Int16Array(samples).map((_, index) =>
              Math.round(800 * Math.sin(index / 20))
            ),
            min: -800,
            max: 800,
            mvPerUnit: 0.001,
          })),
          numberOfChannels: 6,
          numberOfSamples: samples,
          samplingFrequency: 500,
          bitsAllocated: 16,
          sampleInterpretation: 'SS',
        }),
      },
    });

    Object.defineProperty(viewport.canvas, 'clientWidth', { value: 800 });
    Object.defineProperty(viewport.canvas, 'clientHeight', { value: 600 });
    await viewport.setDisplaySets({ displaySetId: 'ecg:1' });

    const lead0 = [[100, 0, 0]];
    const lead2 = [[100, 0, 2]];
    const makeSet = () => [
      measurement(
        'lead-0',
        viewport.getViewReference({ points: lead0 }),
        lead0
      ),
      measurement(
        'lead-2',
        viewport.getViewReference({ points: lead2 }),
        lead2
      ),
      measurement('record', viewport.getViewReference(), []),
      measurement(
        'other-frame-of-reference',
        { ...viewport.getViewReference(), FrameOfReferenceUID: 'other' },
        []
      ),
    ];

    record('ecg:all-leads', kept(viewport, makeSet(), {}));
    const set = makeSet();

    viewport.setViewState({ visibleChannels: [1, 2, 3, 4, 5] });
    record('ecg:without-lead-0', kept(viewport, set, {}));
    viewport.destroy();
    element.remove();
  });
});
