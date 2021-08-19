---
id: tools-usage
---
# Usage
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
csTools3d.addTool(ProbeTool, {})

// 3. All tools need a toolGroup
const stackToolGroup = ToolGroupManager.createToolGroup('stack')

// 4. Adding a tool to the tool group. Note the volumeUID that is
// being passed since csTools need to know which volume it should
// grab the pixel data from
stackToolGroup.addTool('Probe', {
  configuration: { volumeUID: volumeId },
})

// 5. Activating the probeTool and assigning primary mouse button to it.
stackToolGroup.setToolActive('Probe', {
  bindings: [{ mouseButton:  ToolBindings.Mouse.Primary }],
})
```
