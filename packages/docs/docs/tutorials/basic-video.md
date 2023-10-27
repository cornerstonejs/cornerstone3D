---
id: basic-video
---

# Render Video

In this tutorial, you will learn how to render a video.

## Preface

In order to render a video we need:

- an `element` (HTMLDivElement) to use as the container for the viewport
- the URL to the video.
- a server that will serve the video as MP4 using byte range requests
- ideally, the video in 'fast start' format

## Implementation

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

RenderingEngine will handle creation of the viewports, and we can get the viewport object and set the video URL on it, and choose the index of the image to be displayed.

```js
const viewport = renderingEngine.getViewport(viewportId);

viewport.setVideoURL('https://ohif-assets.s3.us-east-2.amazonaws.com/video/rendered.mp4');

viewport.render();
```

:::note Tip
For a compliant DICOMweb server, the video will be available on the rendered endpoint.
It may require an accept header to force it to be served in MP4 format if it is in MPEG2.
It may not support either the fast start encoding or the byte range format, absence of
which will prevent seeking through large videos.  Small videos will likely be buffered
entirely, so they can still seek.

For instance you can look at this example in OHIF which uses the rendered endpoint:
`https://d33do7qe4w26qo.cloudfront.net/dicomweb/studies/2.25.96975534054447904995905761963464388233/series/2.25.15054212212536476297201250326674987992/instances/2.25.179478223177027022014772769075050874231/rendered`


:::

## Final code

See `examples/video/index.ts`

:::note Tip

- Visit [Examples](examples.md#run-examples-locally) page to see how to run the examples locally.
- Check how to debug examples in the [Debugging](examples.md#debugging) section.

:::
