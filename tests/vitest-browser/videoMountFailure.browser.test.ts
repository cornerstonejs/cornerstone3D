import { afterEach, expect, test } from 'vitest';
import {
  displaySetRegistry,
  Enums,
  getRenderingEngine,
  init,
  metaData,
  RenderingEngine,
  type VideoViewport,
} from '@cornerstonejs/core';

const { Events, MetadataModules, ViewportType } = Enums;

const renderingEngineId = 'vitest-video-failure-rendering-engine';
const viewportId = 'vitest-video-failure-viewport';
const urls: Record<string, string> = {
  'video:html': new URL('/', location.href).href,
  'video:missing': new URL('/no-such-video.mp4', location.href).href,
};

/** The URL of each test video, and an image plane for its geometry. */
function videoMetaDataProvider(type: string, imageId: string) {
  if (!urls[imageId]) {
    return;
  }

  if (type === MetadataModules.IMAGE_URL) {
    return { rendered: urls[imageId] };
  }

  if (type === MetadataModules.IMAGE_PLANE) {
    return { rows: 100, columns: 200 };
  }
}

/** A video viewport of a rendering engine, and the events it fires. */
function createVideoViewport() {
  init();
  metaData.addProvider(videoMetaDataProvider, 10000);

  const renderingEngine = new RenderingEngine(renderingEngineId);
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.VIDEO,
    element,
  });

  const events: unknown[] = [];

  element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) =>
    events.push((evt as CustomEvent).detail)
  );

  return {
    element,
    events,
    viewport: renderingEngine.getViewport(viewportId) as VideoViewport,
  };
}

/** The error of a mount, or `'pending'` after 10 s. */
function failureOf(mounted: Promise<void>) {
  return Promise.race([
    mounted.then(
      () => 'mounted',
      (error: Error) => error
    ),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 10000)),
  ]);
}

afterEach(() => {
  getRenderingEngine(renderingEngineId)?.destroy();
  metaData.removeProvider(videoMetaDataProvider);
  displaySetRegistry.clear?.();
  document.body.innerHTML = '';
});

test('a video mount whose URL answers with an HTML page rejects with the media error, fires nothing and leaves no video element', async () => {
  const { element, events, viewport } = createVideoViewport();

  displaySetRegistry.add('v', { imageId: 'video:html' });

  const outcome = await failureOf(
    viewport.setDisplaySets({ displaySetId: 'v' })
  );

  expect(outcome).toBeInstanceOf(Error);
  expect((outcome as Error).message).toMatch(
    new RegExp(
      `^\\[VideoViewport\\] The display set "v" did not load its video ${urls['video:html']}: MEDIA_ERR_SRC_NOT_SUPPORTED`
    )
  );
  expect(((outcome as Error).cause as MediaError).code).toBe(4);
  expect(events).toEqual([]);
  expect(viewport.getDisplaySets()).toEqual([]);
  expect(element.querySelectorAll('video').length).toBe(0);
});

test('a video mount whose URL answers 404 rejects, and the next mount of the same viewport runs and rejects for its own URL', async () => {
  const { element, events, viewport } = createVideoViewport();

  displaySetRegistry.add('missing', { imageId: 'video:missing' });
  displaySetRegistry.add('html', { imageId: 'video:html' });

  const missing = await failureOf(
    viewport.setDisplaySets({ displaySetId: 'missing' })
  );
  const html = await failureOf(
    viewport.setDisplaySets({ displaySetId: 'html' })
  );

  expect((missing as Error).message).toContain(
    'The display set "missing" did not load its video'
  );
  expect((html as Error).message).toContain(
    'The display set "html" did not load its video'
  );
  expect(events).toEqual([]);
  expect(element.querySelectorAll('video').length).toBe(0);
});
