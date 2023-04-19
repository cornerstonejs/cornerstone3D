---
id: namedEvents
title: NamedEvents
---

# Named Events

There are some events that are named, the only one currently supported is the
`wheel` event, but the handling of this is intended to be similar to other
events such as the touch and mouse button events.

### Activating a Tool

You can use `setToolActive` for each toolGroup to activate a tool providing a corresponding namedEvent bindings key.

```js
// Set the ToolGroup's ToolMode for each tool
// Possible modes include: 'Active', 'Passive', 'Enabled', 'Disabled'
ctToolGroup.setToolActive(ZoomTool.toolName, {
  bindings: [
    // Handles the wheel as the event
    { namedEvent: 'wheel' },
    // ALSO handles drag on secondary
    { mouseButton: MouseBindings.Secondary },
  ],
});
ctToolGroup.setToolActive(StackScrollMouseWheelTool.toolName, {
  bindings: [
    // Secondary binding to wheel to stack scroll
    {
      namedEvent: 'wheel',
      modifierKey: KeyboardBindings.Meta,
    },
  ],
});
```
