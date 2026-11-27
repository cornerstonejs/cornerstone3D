import {
  cache,
  imageLoader,
  init,
  metaData,
  setRenderBackend,
  displaySetRegistry,
} from '@cornerstonejs/core';
import { describe, it, expect, afterEach } from '@jest/globals';
import { createPlanarViewportOnStandInEngine } from '../../../core/test/utils/planarViewportOnStandInEngine';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../../utils/test/testUtilsImageLoader';
import filterAnnotationsForDisplay from '../../src/utilities/planar/filterAnnotationsForDisplay';

/**
 * Which annotations of a stack the display filter keeps after the half slice
 * of a stack became half the distance to the next image for
 * `asNearbyProjection` (row 264). The tools ask no `asNearbyProjection`, so
 * the annotations that a stack draws do not change: a 3D point annotation
 * (a frame of reference, a plane and a point, no image) shows on no image of
 * the stack. An application that passes `asNearbyProjection` to the filter
 * now gets such an annotation on the image nearest to its point; 5.x and
 * the betas kept it only within 0.0005 mm of the image.
 */
function fakeImageId(sliceIndex) {
  return `fakeImageLoader:${encodeURIComponent(
    JSON.stringify({
      loader: 'fakeImageLoader',
      name: 'nearbyFilter',
      rows: 16,
      columns: 16,
      barStart: 2,
      barWidth: 4,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  )}`;
}

function setSize(element, width, height) {
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/** A probe annotation at the point (3, 4, z) of the frame of the stack. */
function pointAnnotation(name, frameOfReferenceUID, z, metadata = {}) {
  return {
    annotationUID: name,
    isVisible: true,
    metadata: {
      toolName: 'Probe',
      FrameOfReferenceUID: frameOfReferenceUID,
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: [3, 4, z],
      ...metadata,
    },
    data: { handles: { points: [[3, 4, z]] } },
  };
}

describe('filterAnnotationsForDisplay on a stack with asNearbyProjection (row 264)', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    displaySetRegistry.clear();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    document.body.innerHTML = '';
  });

  async function mountStack(imageIdIndex) {
    window.devicePixelRatio = 1;
    init({});
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);

    const element = document.createElement('div');

    document.body.appendChild(element);
    setSize(element, 64, 64);

    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      'nearbyFilter'
    ));

    const imageIds = [0, 1, 2, 3].map(fakeImageId);

    displaySetRegistry.add('nearbyFilter', { imageIds });
    await viewport.setDisplaySets({
      displaySetId: 'nearbyFilter',
      options: { initialImageIdIndex: imageIdIndex },
    });

    return { viewport, imageIds };
  }

  function kept(viewport, annotations, options) {
    return filterAnnotationsForDisplay(viewport, annotations, options).map(
      (annotation) => annotation.annotationUID
    );
  }

  it('draws the same annotations without the option and keeps a point annotation on the image nearest to it with the option', async () => {
    const { viewport, imageIds } = await mountStack(1);
    const frame = viewport.getFrameOfReferenceUID();
    const annotations = [
      pointAnnotation('on-image', frame, 1),
      pointAnnotation('within-0.3', frame, 1.3),
      pointAnnotation('within-0.45-below', frame, 0.55),
      pointAnnotation('beyond-0.6', frame, 1.6),
      pointAnnotation('other-frame', 'other-frame', 1.3),
      pointAnnotation('image-2', frame, 2, { referencedImageId: imageIds[2] }),
      pointAnnotation('image-1', frame, 1, { referencedImageId: imageIds[1] }),
    ];

    expect(kept(viewport, annotations, {})).toEqual(['image-1']);
    expect(kept(viewport, annotations, { asNearbyProjection: true })).toEqual([
      'on-image',
      'within-0.3',
      'within-0.45-below',
      'image-1',
    ]);

    await viewport.setImageIdIndex(2);

    expect(kept(viewport, annotations, { asNearbyProjection: true })).toEqual([
      'beyond-0.6',
      'image-2',
    ]);
  });
});
