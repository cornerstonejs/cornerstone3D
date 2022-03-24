---
id: tools-usage
---
# Tools Usage
Here we will explain how to use CornerstoneTools3D to manipulate the rendered images and also add annotations to them.

## Initialization and Destroy
`CornerstoneTools.init()` should be called to initialize the event listeners for Canvas. For destroying all
the event listeners completely `CornerstoneTools.destroy()` should be called.

## Canvas and SVG Layer
It should be noted that currently there is a CSS requirement for
SVG layers to appear correctly on top of the canvas. However, this limitation will be removed in near future.

```js
// To hold the canvas and SVG Layers
const viewportPane = document.createElement('div')
viewportPane.style.position = 'relative'
viewportPane.style.width = `${width}px`
viewportPane.style.height = `${height}px`

document.body.appendChild(viewportPane)

const canvas = document.createElement('canvas')

canvas.style.position = 'absolute'
canvas.style.width = '100%'
canvas.style.height = '100%'
viewportPane.appendChild(canvas)
```


## Adding Annotation Tools for Manipulation
The following code-block explains how to add annotation tools to a canvas.

```js
import { ToolGroupManager, ToolBindings } from '@ohif/cornerstone-tools'
import * as csTools3D from '@ohif/cornerstone-tools'

// 1. Initializing the Cornerstone Tools
csTools3d.init()

// 2. Adding tools (it creates tool instance in the background)
csTools3d.addTool(ProbeTool)

// 3. All tools need a toolGroup
const stackToolGroup = ToolGroupManager.createToolGroup('stack')

// 4. Adding a tool to the tool group. Note the volumeId that is
// being passed since csTools need to know which volume it should
// grab the pixel data from
stackToolGroup.addTool(ProbeTool.toolName, {
  configuration: { volumeId: volumeId },
})

// 5. Activating the probeTool and assigning primary mouse button to it.
stackToolGroup.setToolActive(ProbeTool.toolName, {
  bindings: [{ mouseButton:  MouseBindings.Primary }],
})
```


## Crosshairs
Crosshairs enables cross-locating a point in 2 or 3 viewports. They can be
Active, Passive, Enabled, Disabled similar to other tools.

```js
ctSceneToolGroup.addTool(CrosshairsTool.toolName, {
  configuration: {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
  },
})
```


### Rotation
By clicking and dragging a rotation handle, you may change the view of the other viewports in the scene.

### Slab Thickness
You can reformat a thick slab through the data. This feature computes a 2D thick view along the direction of the view from a 3D image.


In order to use the slab thickness you need to set the `blendMode` on the `Scene` to be `BlendMode.MAXIMUM_INTENSITY_BLEND`.


```js
await ctScene.setVolumes([
  {
    volumeId: ctVolumeId,
    blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
  },
])
```
### Configuration
Customization options include changing the colour of the crosshairs and determining whether or not to display the slabThickness and rotation handles.

To familiarize yourself with these options, go to `initiToolGroups` in the demo folder.

```js
ctSceneToolGroup.addTool(CrosshairsTool.toolName, {
  configuration: {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
  },
})
```

<div style={{padding:"56.25% 0 0 0", position:"relative"}}>
    <iframe src="https://player.vimeo.com/video/601952835?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479&amp;h=abc1591622" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style= {{ position:"absolute",top:0,left:0,width:"100%",height:"100%"}} title="annotation-report"></iframe>
</div>
