---
id: core-usage
---
# Core Usage

This page attempts to outline basic usage guidance. A more detailed, real-world
example exists in the `./packages/demo` directory of this repository. All guidance
here builds on the steps outlined on the "Setup" page.


## Example
In this example we render three viewports side by side:
- Viewport-1 (Volume): rendering axial view of CT volume
- Viewport-2 (Volume): rendering sagittal view of CT volume
- Viewport-3 (Stack): rendering x-ray

_index.html_

```html
<canvas class="target-canvas-1"></canvas>
<canvas class="target-canvas-2"></canvas>
<canvas class="target-canvas-3"></canvas>
```

_app.js_

```js
import {
  RenderingEngine, // class
  ORIENTATION, // constant
  ViewportType, // enum
} from '@cornerstone/core'

const sceneUID = 'SCENE_UID'
const volumeId = 'VOLUME_ID'
const viewportId1 = 'viewport_UID_1'
const viewportId2 = 'viewport_UID_2'
const viewportUID3 = 'viewport_UID_3'

// 0. ImageIds to use for this volume, see: `./examples/helpers/getImageIdsAndCacheMetadata.js` for inspiration how to add metadata
const ctImageIds = [
  'streaming-wadors:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/1',
  'streaming-wadors:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/2',
  'streaming-wadors:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/3',
  ......
]

const xrayImageIds = [
  'wadors:https://wadoRsRoot.com/studies/studyInstanceUID/series/SeriesInstanceUID/instances/SOPInstanceUID/frames/1',
]

// 1. Creating a Rendering Engine
const renderingEngine = new RenderingEngine('ExampleRenderingEngineID')

// 2. Defining the 3 viewports
// - sceneUID and viewportId are specified
// - type of viewport (orthographic -> volume)
// - which HTML canvas element to use for this viewport
// - defaultOptions: what is the orientation and background of this viewport
const viewportInput = [
  // Volume viewport (axial)
  {
    sceneUID,
    viewportId: viewportId1,
    type: ViewportType.ORTHOGRAPHIC,
    canvas: document.querySelector('.target-canvas-2'),
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
      background: [0, 0, 0],
    },
  }
  // Volume viewport (sagittal)
  {
    sceneUID,
    viewportId: viewportId2,
    type: ViewportType.ORTHOGRAPHIC,
    canvas: document.querySelector('.target-canvas-2'),
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
      background: [0, 0, 0],
    },
  }
  // stack viewport
  {
    sceneUID,
    viewportId: viewportUID3,
    type: ViewportType.STACK,
    canvas: document.querySelector('.target-canvas-3'),
    defaultOptions: {
      background: [0, 0, 0],
    },
  }
]

// 3. Kick-off rendering
renderingEngine.setViewports(viewportInput)

// 4. Render backgrounds
renderingEngine.render()

// 5. This only creates the volumes, it does not actually load all
// of the pixel data (yet)
const ctVolume = await createAndCacheVolume(volumeId, { imageIds })

// 6. Actual load of the volume. Look into StreamingImageVolume to
// get insight on what happens in a load: Spoiler Alert: each 2D image is requested and its pixel data is put at the correct position in the volume
ctVolume.load(onLoad)

// 7. Tie scene to one or more image volumes
const ctScene = renderingEngine.getScene(sceneUID)

// 8. Setting the volumes for the scene => creating actor and mappers
ctScene.setVolumes([
  {
    volumeId,
    callback: ({ volumeActor, volumeId }) => {
      // Where you might setup a transfer function or PET colormap
      console.log('volume loaded!')
    },
  },
])

// 9. Setting the stack viewport
const stackViewport = renderingEngine.getViewport(viewportUID3)

// 10. Setting initial rendering properties (optional)
stackViewport.setProperties({ voiRange: { lower: -160, upper: 240 } })


// 10. This will initialize volumes in GPU memory
renderingEngine.render()
```

If you're using client-side routing and/or need to clean up resources more
aggressively, most constructs have a `.destroy` method. For example:

```js
renderingEngine.destroy()
```

## Loading a Stack
