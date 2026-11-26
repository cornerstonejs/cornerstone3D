jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElement: jest.fn(),
}));

import {
  cache,
  getEnabledElement,
  imageLoader,
  init,
  metaData,
  setRenderBackend,
  volumeLoader,
  displaySetRegistry,
} from '@cornerstonejs/core';
import { describe, it, expect, afterEach, beforeAll } from '@jest/globals';
import { createPlanarViewportOnStandInEngine } from '../../core/test/utils/planarViewportOnStandInEngine';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import filterAnnotationsForDisplay from '../src/utilities/planar/filterAnnotationsForDisplay';
import PlanarFreehandROITool from '../src/tools/annotation/PlanarFreehandROITool';
import {
  addAnnotation,
  removeAllAnnotations,
} from '../src/stateManagement/annotation/annotationState';

const SLICES = 262;
const FRAME_OF_REFERENCE_UID = 'cost-frame';

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

/** The image ids of a stack of 16 by 16 axial images, one per millimetre. */
function createImageIds(slices = SLICES) {
  return Array.from(
    { length: slices },
    (_, sliceIndex) =>
      `fakeImageLoader:${encodeURIComponent(
        JSON.stringify({
          loader: 'fakeImageLoader',
          name: 'cost',
          rows: 16,
          columns: 16,
          barStart: 2,
          barWidth: 4,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
        })
      )}`
  );
}

/**
 * The image plane of each image with the frame of reference of the stack,
 * which the fake metadata provider leaves out.
 */
function framedPlaneProvider(type, imageId) {
  if (type !== 'imagePlaneModule') {
    return;
  }

  const plane = fakeMetaDataProvider(type, imageId);

  return plane && { ...plane, frameOfReferenceUID: FRAME_OF_REFERENCE_UID };
}

/**
 * A metadata provider ahead of all others that counts the calls of each
 * type and answers none, so that the other providers answer.
 */
function addCountingProvider() {
  const counts = {};
  const provider = (type) => {
    counts[type] = (counts[type] ?? 0) + 1;
  };

  metaData.addProvider(provider, 1000000);

  return {
    counts,
    reset: () => Object.keys(counts).forEach((type) => delete counts[type]),
    total: () => Object.values(counts).reduce((sum, count) => sum + count, 0),
  };
}

/**
 * Contour annotations as the contour display makes them from the contour
 * sets of an RTSTRUCT: a closed planar polyline on the plane of one image,
 * its image and the normal of its points, spread over the slices.
 */
function createContours(
  imageIds,
  count,
  segmentation = { segmentationId: 'rt', segmentIndex: 1 }
) {
  return Array.from({ length: count }, (_, index) => {
    const sliceIndex = Math.floor((index * imageIds.length) / count);

    return {
      annotationUID: `contour-${index}`,
      isVisible: true,
      isLocked: true,
      invalidated: false,
      highlighted: false,
      metadata: {
        toolName: 'PlanarFreehandContourSegmentationTool',
        referencedImageId: imageIds[sliceIndex],
        FrameOfReferenceUID: FRAME_OF_REFERENCE_UID,
        viewPlaneNormal: [0, 0, 1],
      },
      data: {
        contour: {
          closed: true,
          polyline: [
            [4, 4, sliceIndex],
            [12, 4, sliceIndex],
            [12, 12, sliceIndex],
            [4, 12, sliceIndex],
          ],
        },
        ...(segmentation ? { segmentation } : {}),
        handles: {},
      },
    };
  });
}

/**
 * The metadata calls of what a draw of the annotations does: one filter of
 * all of them, then the transform to the canvas of each point of the kept
 * ones, as a tool draws them. Also the number of kept annotations.
 */
function countDrawCalls(counter, viewport, annotations) {
  counter.reset();

  const drawn = filterAnnotationsForDisplay(viewport, annotations);

  drawn.forEach((annotation) =>
    annotation.data.contour.polyline.forEach((point) =>
      viewport.worldToCanvas(point)
    )
  );

  return {
    drawn: drawn.length,
    calls: { total: counter.total(), byType: { ...counter.counts } },
  };
}

/**
 * A stand-in for the SVG drawing helper that the annotation rendering engine
 * makes for each draw of an element, over an SVG layer of the element.
 */
function createSvgDrawingHelper(element) {
  const svgLayerElement = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'svg'
  );
  const nodes = new Map();

  element.appendChild(svgLayerElement);

  return {
    svgLayerElement,
    svgNodeCacheForCanvas: {},
    getSvgNode: (key) => nodes.get(key),
    appendNode: (node, key) => {
      nodes.set(key, node);
      svgLayerElement.appendChild(node);
    },
    setNodeTouched: () => undefined,
    clearUntouched: () => undefined,
  };
}

describe('The metadata calls of a draw of the annotations', () => {
  let renderingEngine;
  let counter;

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

  async function mount(mode, slices = SLICES, initialImageIdIndex = 104) {
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
    metaData.addProvider(framedPlaneProvider, 20000);

    const element = document.createElement('div');

    document.body.appendChild(element);
    setSize(element, 64, 64);

    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      `cost-${mode}-${slices}`
    ));

    const imageIds = createImageIds(slices);
    const volumeId = `cornerstoneStreamingImageVolume:cost-${mode}-${slices}`;

    if (mode === 'volume') {
      await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
    }

    displaySetRegistry.add(`cost-${mode}-${slices}`, {
      imageIds,
      ...(mode === 'volume' ? { volumeId } : {}),
    });
    await viewport.setDisplaySets({
      displaySetId: `cost-${mode}-${slices}`,
      options: { mode, initialImageIdIndex },
    });
    counter = addCountingProvider();

    return { viewport, imageIds };
  }

  it.each(['stack', 'volume'])(
    'is the same with 10 and with 2,000 contours, in %s mode',
    async (mode) => {
      const { viewport, imageIds } = await mount(mode);

      expect(viewport.getCurrentMode()).toBe(mode);

      const few = countDrawCalls(
        counter,
        viewport,
        createContours(imageIds, 10)
      );
      const many = countDrawCalls(
        counter,
        viewport,
        createContours(imageIds, 2000)
      );

      expect(many.drawn).toBeGreaterThan(few.drawn);
      expect(many.calls).toEqual(few.calls);
    }
  );

  /**
   * In volume mode the filter takes the plane of the view from its view
   * reference, whose image is the one of the volume closest to the focal
   * point. Finding it reads the image plane of the images near the slice,
   * not of every image of the volume.
   */
  it('is the same in volume mode for a volume of 50 and of 500 images', async () => {
    const callsOfVolume = async (slices) => {
      const { viewport, imageIds } = await mount('volume', slices, 25);
      const contours = createContours(imageIds.slice(0, 50), 40);
      const calls = countDrawCalls(counter, viewport, contours);

      expect(viewport.getViewReference().referencedImageId).toBe(imageIds[25]);
      renderingEngine.destroy();
      renderingEngine = undefined;
      cache.purgeCache();
      displaySetRegistry.clear();
      metaData.removeAllProviders();

      return calls;
    };
    const few = await callsOfVolume(50);
    const many = await callsOfVolume(500);

    expect(few.drawn).toBeGreaterThan(0);
    expect(many.drawn).toBe(few.drawn);
    expect(many.calls).toEqual(few.calls);
  });

  /**
   * The draw of the freehand contour tool is the draw of the contour
   * segmentation tool, which extends it, without the style of a segmentation:
   * the filter of the contour tools, which filters twice, the check of the
   * image data and the transform of each point of the kept contours.
   */
  it('is the same for a draw of the freehand contour tool with 10 and with 2,000 contours, in stack mode', async () => {
    const { viewport, imageIds } = await mount('stack');
    const enabledElement = {
      viewport,
      viewportId: viewport.id,
      renderingEngineId: renderingEngine.id,
      renderingEngine,
      FrameOfReferenceUID: FRAME_OF_REFERENCE_UID,
    };
    const tool = new PlanarFreehandROITool({
      configuration: { calculateStats: false },
    });

    getEnabledElement.mockReturnValue(enabledElement);

    const draw = (count) => {
      const svgDrawingHelper = createSvgDrawingHelper(viewport.element);

      removeAllAnnotations();
      createContours(imageIds, count, null).forEach((annotation) => {
        annotation.metadata.toolName = PlanarFreehandROITool.toolName;
        addAnnotation(annotation, FRAME_OF_REFERENCE_UID);
      });
      counter.reset();
      tool.renderAnnotation(enabledElement, svgDrawingHelper);

      return {
        drawn: svgDrawingHelper.svgLayerElement.childNodes.length,
        calls: { total: counter.total(), byType: { ...counter.counts } },
      };
    };
    const few = draw(10);
    const many = draw(2000);

    removeAllAnnotations();

    expect(few.drawn).toBe(1);
    expect(many.drawn).toBeGreaterThan(few.drawn);
    expect(many.calls).toEqual(few.calls);
  });

  /**
   * The annotation rendering engine fires `ANNOTATION_RENDERED` for a draw of
   * a viewport when a tool says that it drew. The freehand contour tool, which
   * the contour segmentation tool extends, says so for the contours that are
   * not being edited too, as the contours of an RTSTRUCT, whether it computes
   * statistics or not, and not when no contour is on the slice on display.
   * The contours are open when it computes statistics: the statistics of a
   * closed contour read `closed`, which only a browser defines (row 270 of
   * v6-open-issues.md).
   */
  it.each([false, true])(
    'reports a draw of contours that are not being edited by the freehand contour tool, with calculateStats %s',
    async (calculateStats) => {
      const { viewport, imageIds } = await mount('stack');
      const enabledElement = {
        viewport,
        viewportId: viewport.id,
        renderingEngineId: renderingEngine.id,
        renderingEngine,
        FrameOfReferenceUID: FRAME_OF_REFERENCE_UID,
      };
      const tool = new PlanarFreehandROITool({
        configuration: { calculateStats },
      });
      const draw = (contours) => {
        const svgDrawingHelper = createSvgDrawingHelper(viewport.element);

        removeAllAnnotations();
        contours.forEach((annotation) => {
          annotation.metadata.toolName = PlanarFreehandROITool.toolName;
          annotation.data.contour.closed = !calculateStats;
          addAnnotation(annotation, FRAME_OF_REFERENCE_UID);
        });

        return {
          rendered: tool.renderAnnotation(enabledElement, svgDrawingHelper),
          drawn: svgDrawingHelper.svgLayerElement.childNodes.length,
        };
      };

      const { getBBox } = window.SVGElement.prototype;

      window.SVGElement.prototype.getBBox = () => ({
        x: 0,
        y: 0,
        width: 20,
        height: 10,
      });
      getEnabledElement.mockReturnValue(enabledElement);

      const onSlice = draw(createContours(imageIds, 10, null));
      const offSlice = draw(createContours(imageIds.slice(0, 50), 5, null));

      removeAllAnnotations();
      window.SVGElement.prototype.getBBox = getBBox;

      expect(onSlice.drawn).toBeGreaterThan(0);
      expect(onSlice.rendered).toBe(true);
      expect(offSlice.drawn).toBe(0);
      expect(offSlice.rendered).toBe(false);
    }
  );
});
