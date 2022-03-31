---
id: basic-stack
---

# Render Stack of Images

## Preface

In order to render a set of images we need:

- an `element` (HTMLDivElement) to use as the container for the viewport
- the path to the images (`imageId`s).

## Implementation

We have already stored images on a dicom server for the purpose of this tutorial.

First let's create an HTML element and style it to look like a viewport.

```js
const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
```

Next, we need a `renderingEngine` and a `viewport` to render the images.

```js
const renderingEngineId = 'myRenderingEngine';
const renderingEngine = new RenderingEngine(renderingEngineId);
```

We can then create a `viewport` inside the renderingEngine by using the `enableElement` API. Note that since we don't want to render a volume for the
purpose of this tutorial, we specify the type of the viewport to be `Stack`.

```js
const viewportId = 'CT_SAGITTAL_STACK';

const viewportInput = {
  viewportId,
  element,
  type: ViewportType.STACK,
};

renderingEngine.enableElement(viewportInput);
```

RenderingEngine will handle creation of the viewports, and we can get the viewport object and set the images on it, and choose the index of the image to be displayed.

```js
const viewport = renderingEngine.getViewport(viewportId);

viewport.setStack(imageIds, 60);
```

:::note Tip
Since imageIds is an arrays of imageId, we can set which one to be displayed using
the second argument of `setStack`.
:::

## Final code

```js
const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';
const renderingEngine = new RenderingEngine(renderingEngineId);

const viewportInput = {
  viewportId,
  element,
  type: ViewportType.STACK,
};

renderingEngine.enableElement(viewportInput);

const viewport = renderingEngine.getViewport(viewportInput.viewportId);

viewport.setStack(imageIds, 60);
```
