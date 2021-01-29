# Custom Tools

A Cornerstone Tool is any class that implements or extends the interface defined
by the `BaseTool` or `BaseAnnotationTool` abstract classes. Creating a custom tool
is as simple as:

```js
import csTools3d, { BaseAnnotationTool, BaseTool } from '@Tools`

class MyCustomTool extends BaseTool {
  // ...
}

csTools3d.addTool(MyCustomTool, { /* Tool Options */ })
```

## BaseTool

A base tool has a name, configuration, options, strategies, bindings, and more. Base
tools are often used to respond to user input and effect some change on the viewport
(like its camera). Example `BaseTool`s include:

- Pan
- PetThreshold
- StackScroll
- StackScrollMouseWheel
- WindowLevel
- Zoom

## AnnotationTool

An annotation tool often has "Tool State" that is tied to frame of reference. It has
additional methods that allow tools to indicate they should handle/capture an interaction.
This is most often used for "interactions near a handle" or "interactions near a
rendered tool line".

Annotation tools that are in the `Active` mode have an `addNewMeasurement` method
that's called when a mouse event is not captured. This allows the active tool to
create Tool State for the interaction. Example `AnnotationTool`s include:

- Bidirectional
- EllipticalRoi
- Length
- Probe
- RectangleRoi

## Next steps

For next steps, you can:

- [Check out the Usage documentation](#)
- [Explore our example application's source code](#)
