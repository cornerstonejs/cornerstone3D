---
id: basic-video
title: Render Video
summary: Tutorial on rendering and annotating videos in Cornerstone3D, including video viewport configuration and time-based annotation capabilities
---

# Render Video

In this tutorial, you will learn how to render a video.

## Preface

In order to render a video we need:

- Initialize cornerstone and related libraries.
- an `element` (HTMLDivElement) to use as the container for the viewport
- the URL to the video.
- a server that will serve the video as MP4 using byte range requests
- ideally, the video in 'fast start' format

## Implementation

**Initialize cornerstone and related libraries**

```js
import { init as coreInit } from '@cornerstonejs/core';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';

await coreInit();
await dicomImageLoaderInit();
```

**Create an HTML element**

We have already stored images on a server for the purpose of this tutorial.

First let's create an HTML element and style it to look like a viewport.

```js
const content = document.getElementById('content');
const element = document.createElement('div');

element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
```

Next, we need a `renderingEngine` and a `viewport` to render the images.

```js
const renderingEngineId = 'myRenderingEngine';
const renderingEngine = new RenderingEngine(renderingEngineId);
```

We can then create a `viewport` inside the renderingEngine by using the `enableElement` API. Note that since we want to render a video, we have to specify the `ViewportType.VIDEO`.

```js
const viewportId = 'CT_AXIAL_STACK';

const viewportInput = {
  viewportId,
  element,
  type: ViewportType.VIDEO,
};

renderingEngine.enableElement(viewportInput);
```

RenderingEngine will handle creation of the viewports. A video viewport shows a
video display set. The image id of a DICOM video instance can be passed as the
`displaySetId`, so no registration is needed. The demo helper
`createDisplaySets` splits a series into display sets, and the one that it marks
as `'video'` holds the video.

```ts
const displaySets = await createDisplaySets({
  StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
  SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
  wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
});
const videoDisplaySet = displaySets.find((ds) => ds.handler === 'video');

const viewport = renderingEngine.getViewport<VideoViewport>(viewportId);

await viewport.setDisplaySets({
  displaySetId: videoDisplaySet.instances[0].imageId,
});

await viewport.play();
```

The video opens on its first frame. Pass `options: { frameNumber }` in the
entry of `setDisplaySets` to open it on another frame (frame numbers start at
1).

:::note Tip
For a compliant DICOMweb server, the video will be available on the rendered endpoint.
It may require an accept header to force it to be served in MP4 format if it is in MPEG2.
It may not support either the fast start encoding or the byte range format, absence of
which will prevent seeking through large videos. Small videos will likely be buffered
entirely, so they can still seek.

For instance you can look at this example in OHIF which uses the rendered endpoint:
`https://d33do7qe4w26qo.cloudfront.net/dicomweb/studies/2.25.96975534054447904995905761963464388233/series/2.25.15054212212536476297201250326674987992/instances/2.25.179478223177027022014772769075050874231/rendered`

:::

## Final code

<details>
<summary>Final code</summary>

```ts
import {
  init as coreInit,
  RenderingEngine,
  Enums,
  VideoViewport,
} from '@cornerstonejs/core';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';
import { createDisplaySets } from '../../../../utils/demo/helpers';

const { ViewportType } = Enums;

const content = document.getElementById('content');
const element = document.createElement('div');

element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  await coreInit();
  await dicomImageLoaderInit();

  const displaySets = await createDisplaySets({
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const videoDisplaySet = displaySets.find((ds) => ds.handler === 'video');

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportId = 'CT_AXIAL_STACK';

  const viewportInput = {
    viewportId,
    element,
    type: ViewportType.VIDEO,
  };

  renderingEngine.enableElement(viewportInput);

  const viewport = renderingEngine.getViewport<VideoViewport>(viewportId);

  await viewport.setDisplaySets({
    displaySetId: videoDisplaySet.instances[0].imageId,
  });

  await viewport.play();
}

run();
```

</details>

:::note Tip

- Visit [Examples](examples.md#run-examples-locally) page to see how to run the examples locally.
- Check how to debug examples in the [Debugging](examples.md#debugging) section.

:::

# Video Annotations

If the video viewport shows a display set whose image id has associated
metadata, as above, then it is possible to use annotations with the video viewport.
These annotations will be shown on either a range of frames or a single frame,
with some amount of time range allowed so that the annotation will actually be seen.

The `utilities.AnnotationMultiSlice` class of the tools supports setting and
retrieving frame ranges on annotations. This is done by modifying the imageID in
the `/frames/<number>` section or the `frameNumber=<number>` attribute. These
become a range when the annotation applies to a range of values. On a video
viewport it sets the view state key `frameRange`.

The frame range is automatically set when created to the current range being
played on the video when the video is playing, or the frame number currently
being displayed when not playing.
