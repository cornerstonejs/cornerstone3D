---
id: touchEvents
title: TouchEvents
---

# Touch Events

Touch events are fired when the user touches device with one or more touch points such as a finger or stylus. The flow of touch points are the following:

1. `TOUCH_START`
2. `TOUCH_START_ACTIVATE`
3. optional: `TOUCH_PRESS`
4. optional: `TOUCH_DRAG`
5. optional: `TOUCH_SWIPE`
6. `TOUCH_END`

Every time a user places a finger down and lifts it up, the touch order flow will always follow the above. Touch events are mutually exclusive from click events.

Other touch events that can occur are the `TOUCH_TAP` event. A `TOUCH_TAP` will not trigger a `TOUCH_START` event flow. If the user taps successively, only one `TOUCH_TAP` event will fire with the count of how many times the user tapped.

| EVENT                  | Description                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TOUCH_START`          | Triggers if the user places their touchpoint down for > 50ms.                                                                                                                                    |
| `TOUCH_START_ACTIVATE` | Triggers only if no tools decided to stop propagation from the `TOUCH_START` event. It is useful to differentiate between touching an existing annotaton, vs needing to create a new annotaiton. |
| `TOUCH_PRESS`          | Triggers if the user places their touchpoint down and does not move it for > 700ms                                                                                                               |
| `TOUCH_DRAG`           | Triggers anytime the user moves their touchpoint, may occur before `TOUCH_PRESS` since the `TOUCH_PRESS` event will tolerate some motion.                                                        |
| `TOUCH_SWIPE`          | Triggers alongside `TOUCH_DRAG` if the user moves more than `100px` within a single drag cycle.                                                                                                  |
| `TOUCH_END`            | Triggers when the user lifts one or more of their touchpoints.                                                                                                                                   |
| `TOUCH_TAP`            | Triggers when the user makes contact with screen for less than 50ms - 10ms (buffer from the `TOUCH_START` event.)                                                                                |

## Multitouch

Touch events natively support multitouch which is provided as a list of [`ITouchPoints[]`](api/tools/namespace/Types#ITouchPoints).
In order for touch events to be compatiable with mouse events, these `ITouchPoints[]` need to be reduced into a single
`ITouchPoint`. The current strategy for array reduction is taking the mean coordinate values. Other strategies can be
implemented such as first point, median point, etc. This can be implemented in the
[`touch` utilities codebase](https://github.com/cornerstonejs/cornerstone3D-beta/main/packages/tools/src/utilities/touch/index.ts)

The structure of `ITouchPoints` are the following:

```js
type ITouchPoints = {
  /** page coordinates of the point */
  page: Types.Point2,
  /** client coordinates of the point */
  client: Types.Point2,
  /** canvas coordinates of the point */
  canvas: Types.Point2,
  /** world coordinates of the point */
  world: Types.Point3,

  /** Native Touch object properties which are JSON serializable*/
  touch: {
    identifier: string,
    radiusX: number,
    radiusY: number,
    force: number,
    rotationAngle: number,
  },
};
```

## Multitouch Drag Calculations

`TOUCH_DRAG` events have the following structure:

```js
type TouchDragEventDetail = NormalizedTouchEventDetail & {
  /** The starting points of the touch event. */
  startPoints: ITouchPoints,
  /** The last points of the touch. */
  lastPoints: ITouchPoints,
  /** The current touch position. */
  currentPoints: ITouchPoints,
  startPointsList: ITouchPoints[],
  /** The last points of the touch. */
  lastPointsList: ITouchPoints[],
  /** The current touch position. */
  currentPointsList: ITouchPoints[],

  /** The difference between the current and last points. */
  deltaPoints: IPoints,
  /** The difference between distances between the current and last points. */
  deltaDistance: IDistance,
};
```

`deltaPoints` is the difference between the mean coordinate point of `lastPointsList` and `currentPointsList`.
`deltaDistance` is the difference between the average distance between points in `lastPointsList` vs `currentPointsList`

## Usage

You can add an event listener to the element for the event.

```js
import Events from '@cornerstonejs/tools/enums/Events';
// element is the cornerstone viewport element
element.addEventListener(Events.TOUCH_DRAG, (evt) => {
  // my function on drag
  console.log(evt);
});

element.addEventListener(Events.TOUCH_SWIPE, (evt) => {
  // my function on swipe
  console.log(evt);
});

// within the chrome console in a deployed OHIF application
cornerstone
  .getEnabledElements()[0]
  .viewport.element.addEventListener(Events.TOUCH_SWIPE, (evt) => {
    // my function on swipe
    console.log('SWIPE', evt);
  });
```

A full example can be found by running
`yarn run example stackManipulationToolsTouch` whose source is [here](https://github.com/gradienthealth/cornerstone3D-beta/blob/gradienthealth/added_touch_events/packages/tools/examples/stackManipulationToolsTouch/index.ts)

## Binding

Touch tools have bindings depending on the number of pointers that are placed down.
In the future, bindings can be filter based on force, as well as radius (stylus detection).
The `numTouchPoints` can be as many as is supported by hardware.

```js
// Add tools to Cornerstone3D
cornerstoneTools.addTool(PanTool);
cornerstoneTools.addTool(WindowLevelTool);
cornerstoneTools.addTool(StackScrollTool);
cornerstoneTools.addTool(ZoomTool);

// Define a tool group, which defines how mouse events map to tool commands for
// Any viewport using the group
const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

// Add tools to the tool group
toolGroup.addTool(WindowLevelTool.toolName);
toolGroup.addTool(PanTool.toolName);
toolGroup.addTool(ZoomTool.toolName);
toolGroup.addTool(StackScrollTool.toolName);

// Set the initial state of the tools, here all tools are active and bound to
// Different touch inputs
// 5 touch points are possible => unlimited touch points are supported, but is generally limited by hardware.
toolGroup.setToolActive(ZoomTool.toolName, {
  bindings: [{ numTouchPoints: 2 }],
});
toolGroup.setToolActive(StackScrollTool.toolName, {
  bindings: [{ numTouchPoints: 3 }],
});
toolGroup.setToolActive(WindowLevelTool.toolName, {
  bindings: [
    {
      mouseButton: MouseBindings.Primary, // special condition for one finger touch
    },
  ],
});
```

The `MouseBindings.Primary` is a special binding type which will
automatically bind single finger touch.

## Touch and Mouse Event Analogs

Touch and Mouse Events share a lot of overlapping inheritance. Most touch events
have a mouse event analog. See the below:

| TOUCH EVENT            | MOUSE_EVENT           |
| ---------------------- | --------------------- |
| `TOUCH_START`          | `MOUSE_DOWN`          |
| `TOUCH_START_ACTIVATE` | `MOUSE_DOWN_ACTIVATE` |
| `TOUCH_PRESS`          | N/A                   |
| `TOUCH_DRAG`           | `MOUSE_DRAG`          |
| `TOUCH_SWIPE`          | N/A                   |
| `TOUCH_END`            | `MOUSE_UP`            |
| `TOUCH_TAP`            | `MOUSE_CLICK`         |

The main difference between touch events and mouse events are that touch events
can have multiple pointers (multi-touch). Touch events will automatically reduce
multiple pointers into a single point value. The default way these points are
reduced is taking the weighted average. This reduced point can be used as a `IPoints`
or `ITouchPoints` depending if touch information is needed.

In the case multiple touch points are needed, they are accessible in list form.

```js
type MousePointsDetail = {
  /** The starting points of the mouse event. */
  startPoints: IPoints,
  /** The last points of the mouse. */
  lastPoints: IPoints,
  /** The current mouse position. */
  currentPoints: IPoints,
  /** The difference between the current and last points. */
  deltaPoints: IPoints,
};

type TouchPointsDetail = {
  /** The starting points of the touch event. */
  startPoints: ITouchPoints,
  /** The last points of the touch. */
  lastPoints: ITouchPoints,
  /** The current touch position. */
  currentPoints: ITouchPoints,

  startPointsList: ITouchPoints[],
  /** The last points of the touch. */
  lastPointsList: ITouchPoints[],
  /** The current touch position. */
  currentPointsList: ITouchPoints[],

  /** The difference between the current and last points. */
  deltaPoints: IPoints,
  /** The difference between distances between the current and last points. */
  deltaDistance: IDistance,
};
```
