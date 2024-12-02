---
id: tools
title: '@cornerstonejs/tools'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';


# @cornerstonejs/tools

## triggerAnnotationRenderForViewportIds

Now only requires viewportIds and doesn't need renderingEngine anymore

```js
triggerAnnotationRenderForViewportIds(renderingEngine, viewportIds) ---> triggerAnnotationRenderForViewportIds(viewportIds)
```

<details>
<summary>Why?</summary>
Since there is one rendering engine per viewport, there is no need to pass the rendering engine as an argument.
</details>

## Tools

### StackScrollMouseWheelTool -> StackScrollTool

We've decoupled the Mouse Wheel from the tool itself, allowing it to be applied as a binding similar to other mouse bindings.

This change offers several advantages:

- It can be combined with other mouse bindings
- It can be paired with keyboard bindings

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
cornerstoneTools.addTool(StackScrollMouseWheelTool);
toolGroup.addTool(StackScrollMouseWheelTool.toolName);
toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
cornerstoneTools.addTool(StackScrollTool);
toolGroup.addTool(StackScrollTool.toolName);
toolGroup.setToolActive(StackScrollTool.toolName, {
  bindings: [
    {
      mouseButton: MouseBindings.Wheel,
    },
  ],
});
```

  </TabItem>
</Tabs>

### BaseTool

The `getTargetVolumeId` method has been removed in favor of `getTargetId`, and `getTargetIdImage` has been renamed to `getTargetImageData` to make it more clear that it is an image data.

### Usage Example

<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```typescript
const volumeId = this.getTargetVolumeId(viewport);
const imageData = this.getTargetIdImage(targetId, renderingEngine);
```

</TabItem>
<TabItem value="After" label="After 🚀">

```typescript
const imageData = this.getTargetImageData(targetId);
```

</TabItem>
</Tabs>

## New Segmentation Model

We have a new segmentation model that is more flexible and easier to use.

### Same Terminology, Different Architecture

In Cornerstone3D version 2, we've made significant architectural changes to our segmentation model while maintaining familiar terminology. This redesign aims to provide a more flexible and intuitive approach to working with segmentations across different viewports. Here are the key changes and the reasons behind them:

1. **Viewport-Specific, Not Tool Group-Based**:

   - Old: Segmentations were tied to tool groups, which typically consist of multiple viewports. This created complications when users wanted to add segmentations to some viewports but not others within the same tool group.
   - New: Segmentations are now viewport-specific. Instead of adding or removing representations to a tool group, users can add them directly to viewports. This provides much finer control over what each viewport renders.
   - Why: We discovered that tying rendering to a tool group is not an effective approach. It often necessitated creating an extra tool group for a specific viewport to customize or prevent rendering.

2. **Simplified Identification of Segmentation Representations**:

   - Old: Required a unique segmentationRepresentationUID for identification.
   - New: Segmentation representations are identified by a combination of `segmentationId` and representation `type`. This allows each viewport to have different representations of the same segmentation.
   - Why: This simplification makes it easier to manage and reference segmentation representations across different viewports.

3. **Decoupling of Data and Visualization**:

   - Old: Segmentation rendering was tightly coupled with tool groups.
   - New: Segmentation is now treated purely as data, separate from the tools used to interact with it.
   - Why: While it's appropriate for tools to be bound to tool groups, viewport-specific functionalities like segmentation rendering should be the responsibility of individual viewports. This separation allows for more flexible rendering and interaction options across different viewports.

4. **Polymorphic Segmentation Support**:

   - The new architecture better supports the concept of polymorphic segmentations, where a single segmentation can have multiple representations (e.g., labelmap, contour, surface) that can be efficiently converted between each other.
   - Why: This flexibility allows for more efficient storage, analysis, and real-time visualization of segmentations.

5. **Consistent API Across Representation Types**:
   - The new API provides a unified way to work with different segmentation representations, making it easier to manage complex scenarios involving multiple viewports and representation types.
   - Why: This consistency simplifies development and reduces the likelihood of errors when working with different segmentation types.

These architectural changes provide a more robust foundation for working with segmentations, especially in complex multi-viewport scenarios. The new approach has proven to be highly effective and opens up possibilities for future enhancements. While the core concepts remain similar, the way you interact with segmentations in your code will change significantly. This migration guide will walk you through these changes, providing before-and-after examples to help you update your existing codebase to the new architecture.

### Segmentation State

The `Segmentation` type has been restructured to better organize segment information and representation data. Let's take a look at the changes before we
talk about migration guides.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
type Segmentation = {
  segmentationId: string;
  type: Enums.SegmentationRepresentations;
  label: string;
  activeSegmentIndex: number;
  segmentsLocked: Set<number>;
  cachedStats: { [key: string]: number };
  segmentLabels: { [key: string]: string };
  representationData: SegmentationRepresentationData;
};
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
type Segmentation = {
  segmentationId: string;
  label: string;
  segments: {
    [segmentIndex: number]: Segment;
  };
  representationData: RepresentationsData;
};

type Segment = {
  segmentIndex: number;
  label: string;
  locked: boolean;
  cachedStats: { [key: string]: unknown };
  active: boolean;
};
```

  </TabItem>
</Tabs>

The new segmentation state model offers a more organized data structure. Previously scattered information such as `cachedStats`, `segmentLabels`, and `activeSegmentIndex` has been consolidated under the `segments` property. This restructuring enhances clarity and efficiency. In the following sections, we'll discuss migration guides that will explain how to access and modify these properties within the new structure. This reorganization primarily affects the segmentation store level.

#### Representation Data Key

The `SegmentationRepresentations` enum has been updated to use title case instead of uppercase to make it match the rest of the Enums.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
enum SegmentationRepresentations {
  Labelmap = 'LABELMAP',
  Contour = 'CONTOUR',
  Surface = 'SURFACE',
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
enum SegmentationRepresentations {
  Labelmap = 'Labelmap',
  Contour = 'Contour',
  Surface = 'Surface',
}
```

  </TabItem>
</Tabs>

This change affects how representation data is accessed:

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
const representationData = segmentation.representationData.SURFACE;
const representationData = segmentation.representationData.LABELMAP;
const representationData = segmentation.representationData.CONTOUR;
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
const representationData = segmentation.representationData.Surface;
const representationData = segmentation.representationData.Labelmap;
const representationData = segmentation.representationData.Contour;
```

  </TabItem>
</Tabs>

#### Segmentation Representation

The representation structure has been simplified and is now viewport-specific.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
type ToolGroupSpecificRepresentation =
  | ToolGroupSpecificLabelmapRepresentation
  | ToolGroupSpecificContourRepresentation;

type ToolGroupSpecificRepresentationState = {
  segmentationRepresentationUID: string;
  segmentationId: string;
  type: Enums.SegmentationRepresentations;
  active: boolean;
  segmentsHidden: Set<number>;
  colorLUTIndex: number;
};

type SegmentationState = {
  toolGroups: {
    [key: string]: {
      segmentationRepresentations: ToolGroupSpecificRepresentations;
      config: SegmentationRepresentationConfig;
    };
  };
};
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
type SegmentationRepresentation =
  | LabelmapRepresentation
  | ContourRepresentation
  | SurfaceRepresentation;

type BaseSegmentationRepresentation = {
  colorLUTIndex: number;
  segmentationId: string;
  type: Enums.SegmentationRepresentations;
  visible: boolean;
  active: boolean;
  segments: {
    [segmentIndex: number]: {
      visible: boolean;
    };
  };
};

type SegmentationState = {
  viewportSegRepresentations: {
    [viewportId: string]: Array<SegmentationRepresentation>;
  };
};
```

  </TabItem>
</Tabs>

Previously, the segmentation representation was tool group specific, which led to some issues. In the new structure, segmentation representation is viewport specific. It now consists of a segmentationId, a type, and various settings for that segmentation. As a result of this change, several functions have been removed or modified. Here's a summary of the changes:

#### Removed Functions

- `getDefaultSegmentationStateManager`
- `getSegmentationRepresentations`
- `getAllSegmentationRepresentations`
- `getSegmentationIdRepresentations`
- `findSegmentationRepresentationByUID`
- `getToolGroupIdsWithSegmentation`
- `getToolGroupSpecificConfig`
- `setToolGroupSpecificConfig`
- `getGlobalConfig`
- `setGlobalConfig`
- `setSegmentationRepresentationSpecificConfig`
- `getSegmentationRepresentationSpecificConfig`
- `getSegmentSpecificRepresentationConfig`
- `setSegmentSpecificRepresentationConfig`
- `getToolGroupIdFromSegmentationRepresentationUID`
- `addSegmentationRepresentation`
- `getSegmentationRepresentationByUID`

#### New Functions

- `addSegmentations(segmentationInputArray)`
- `removeSegmentation(segmentationId)`
- `getSegmentation(segmentationId)`
- `getSegmentations()`
- `getSegmentationRepresentation(viewportId, specifier)`
- `getSegmentationRepresentations(viewportId, specifier)`
- `removeSegmentationRepresentation(viewportId, specifier, immediate)`
- `removeAllSegmentationRepresentations()`
- `removeLabelmapRepresentation(viewportId, segmentationId, immediate)`
- `removeContourRepresentation(viewportId, segmentationId, immediate)`
- `removeSurfaceRepresentation(viewportId, segmentationId, immediate)`
- `getViewportSegmentations(viewportId, type)`
- `getViewportIdsWithSegmentation(segmentationId)`
- `getCurrentLabelmapImageIdForViewport(viewportId, segmentationId)`
- `updateLabelmapSegmentationImageReferences(segmentationId, imageIds)`
- `getStackSegmentationImageIdsForViewport(viewportId, segmentationId)`
- `destroy()`

### Removal of SegmentationDisplayTool

There's no need to add the SegmentationDisplayTool to the toolGroup anymore.

Before

```js
toolGroup2.addTool(SegmentationDisplayTool.toolName);

toolGroup1.setToolEnabled(SegmentationDisplayTool.toolName);
```

Now

```js
// nothing
```

### Stack Labelmaps

To create a Stack Labelmap, you no longer need to manually create a reference between labelmap imageIds and viewport imageIds. We now handle this process automatically for you.

This is a long Why ...

The previous model required users to provide an imageIdReferenceMap, which linked labelmap imageIds to viewport imageIds. This approach presented several challenges when implementing advanced segmentation use cases:

1. Manual creation of the map was error-prone, particularly regarding the order of imageIds.

2. Once a segmentation was associated with specific viewport imageIds, rendering it elsewhere became problematic. For example:

   - Rendering a CT image stack segmentation on a single key image.
   - Rendering a CT image stack segmentation on a stack that includes both CT and other images.
   - Rendering a DX dual energy segmentation from energy 1 on energy 2.
   - Rendering a CT labelmap from a stack viewport on a PT labelmap in the same space.

These scenarios highlight the limitations of the previous model.

We've now transitioned to a system where users only need to provide imageIds. During rendering, we match the viewport's current imageId against the labelmap imageIds and render the segmentation if there's a match. This matching process occurs in the SegmentationStateManager, with the criterion being that the segmentation must be in the same plane as the referenced viewport.

This new approach enables numerous additional use cases and offers greater flexibility in segmentation rendering.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
segmentation.addSegmentations([
  {
    segmentationId,
    representation: {
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
      data: {
        imageIdReferenceMap:
          cornerstoneTools.utilities.segmentation.createImageIdReferenceMap(
            imageIds,
            segmentationImageIds
          ),
      },
    },
  },
]);
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
segmentation.addSegmentations([
  {
    segmentationId,
    representation: {
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
      data: {
        imageIds: segmentationImageIds,
      },
    },
  },
]);
```

  </TabItem>
</Tabs>

### Adding Segmentations

#### Function Signature Update

The `addSegmentations` function now accepts an optional `suppressEvents` parameter.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function addSegmentations(
  segmentationInputArray: SegmentationPublicInput[]
): void;
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function addSegmentations(
  segmentationInputArray: SegmentationPublicInput[],
  suppressEvents?: boolean
): void;
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update any calls to `addSegmentations` to include the `suppressEvents` parameter if needed.
2. If you don't want to suppress events, you can omit the second parameter.

#### SegmentationPublicInput Type Updates

The `SegmentationPublicInput` type has been extended to include an optional `config` property.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
type SegmentationPublicInput = {
  segmentationId: string;
  representation: {
    type: Enums.SegmentationRepresentations;
    data?: RepresentationData;
  };
};
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
type SegmentationPublicInput = {
  segmentationId: string;
  representation: {
    type: Enums.SegmentationRepresentations;
    data?: RepresentationData;
  };
  config?: {
    segments?: {
      [segmentIndex: number]: Partial<Segment>;
    };
    label?: string;
  };
};
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update any code that creates or manipulates `SegmentationPublicInput` objects to include the new `config` property if needed.
2. Replace specific segmentation data types with the generic `RepresentationData` type.

### Adding Segmentation Representations

#### Viewport-Centric Approach

The API now focuses on viewports instead of tool groups, providing more granular control over segmentation representations.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function addSegmentationRepresentations(
  toolGroupId: string,
  representationInputArray: RepresentationPublicInput[],
  toolGroupSpecificRepresentationConfig?: SegmentationRepresentationConfig
): Promise<string[]>;
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function addSegmentationRepresentations(
  viewportId: string,
  segmentationInputArray: RepresentationPublicInput[]
);
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Replace `toolGroupId` with `viewportId` in function calls.
2. Remove the `toolGroupSpecificRepresentationConfig` parameter.
3. Update any code that relies on the returned Promise of segmentation representation UIDs.

#### RepresentationPublicInput Changes

The `RepresentationPublicInput` type has been simplified and some properties have been renamed or removed.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
type RepresentationPublicInput = {
  segmentationId: string;
  type: Enums.SegmentationRepresentations;
  options?: {
    segmentationRepresentationUID?: string;
    colorLUTOrIndex?: Types.ColorLUT | number;
    polySeg?: {
      enabled: boolean;
      options?: any;
    };
  };
};
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
type RepresentationPublicInput = {
  segmentationId: string;
  type?: Enums.SegmentationRepresentations;
  config?: {
    colorLUTOrIndex?: Types.ColorLUT[] | number;
  };
};
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Remove the `options` property and move `colorLUTOrIndex` to the `config` object.
2. Remove `segmentationRepresentationUID` and `polySeg` properties if used, polySEG is default enabled.
3. Update the `colorLUTOrIndex` type to accept an array of `Types.ColorLUT` instead of a single value.

#### New Representation-Specific Functions

Version 2 introduces new functions for adding specific types of segmentation representations to viewports.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
// No equivalent functions in version 1
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function addContourRepresentationToViewport(
  viewportId: string,
  contourInputArray: RepresentationPublicInput[]
);

function addLabelmapRepresentationToViewport(
  viewportId: string,
  labelmapInputArray: RepresentationPublicInput[]
);

function addSurfaceRepresentationToViewport(
  viewportId: string,
  surfaceInputArray: RepresentationPublicInput[]
);
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Replace generic `addSegmentationRepresentations` calls with the appropriate representation-specific function.
2. Update the input array to match the new `RepresentationPublicInput` type.
3. Remove any type-specific logic from your code, as it's now handled by these new functions.

#### Multi-Viewport Functions

Version 2 introduces new functions for adding segmentation representations to multiple viewports simultaneously.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
// No equivalent functions in version 1
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function addContourRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
});

function addLabelmapRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
});

function addSurfaceRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
});
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. If you were previously adding representations to multiple tool groups, refactor your code to use these new multi-viewport functions.
2. Create a `viewportInputMap` object with viewport IDs as keys and arrays of `RepresentationPublicInput` as values.
3. Call the appropriate multi-viewport function based on the representation type.

### Events

Since we moved from toolGroup to viewport, many events have been renamed to include `viewportId` instead of `toolGroupId`, and
some event details have been changed to include `segmentationId` instead of `segmentationRepresentationUID` or toolGroupId

#### Removal of ToolGroup Specific Events

The `triggerSegmentationRepresentationModified` and `triggerSegmentationRepresentationRemoved` functions have been removed. Instead, the library now uses a more generalized approach for handling segmentation events.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function triggerSegmentationRepresentationModified(
  toolGroupId: string,
  segmentationRepresentationUID?: string
): void {
  // ...
}

function triggerSegmentationRepresentationRemoved(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function triggerSegmentationRepresentationModified(
  viewportId: string,
  segmentationId: string,
  type?: SegmentationRepresentations
): void {
  // ...
}

function triggerSegmentationRepresentationRemoved(
  viewportId: string,
  segmentationId: string,
  type: SegmentationRepresentations
): void {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Replace `toolGroupId` with `viewportId` in function calls.
2. Replace `segmentationRepresentationUID` with `segmentationId`.
3. Add the `type` parameter to specify the segmentation representation type.

#### Simplified Segmentation Modified Event

The `triggerSegmentationModified` function has been simplified to always require a `segmentationId`.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function triggerSegmentationModified(segmentationId?: string): void {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function triggerSegmentationModified(segmentationId: string): void {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Ensure that `segmentationId` is always provided when calling `triggerSegmentationModified`.
2. Remove any logic that handles the case where `segmentationId` is undefined.

#### Updated Event Detail Types

Several event detail types have been updated to reflect the changes in the segmentation system:

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
type SegmentationRepresentationModifiedEventDetail = {
  toolGroupId: string;
  segmentationRepresentationUID: string;
};

type SegmentationRepresentationRemovedEventDetail = {
  toolGroupId: string;
  segmentationRepresentationUID: string;
};

type SegmentationRenderedEventDetail = {
  viewportId: string;
  toolGroupId: string;
};
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
type SegmentationRepresentationModifiedEventDetail = {
  segmentationId: string;
  type: string;
  viewportId: string;
};

type SegmentationRepresentationRemovedEventDetail = {
  segmentationId: string;
  type: string;
  viewportId: string;
};

type SegmentationRenderedEventDetail = {
  viewportId: string;
  segmentationId: string;
  type: string;
};
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update event listeners to use the new event detail types.
2. Replace `toolGroupId` with `viewportId` where applicable.
3. Use `segmentationId` instead of `segmentationRepresentationUID`.
4. Add handling for the new `type` field in event details.

### Segmentation Config/Style

In Cornerstone3D version 2.x, we have significantly refactored the segmentation configuration APIs to provide a more flexible and unified approach for managing segmentation styles across different representations (Labelmap, Contour, Surface). The old APIs for getting and setting segmentation configurations have been replaced with new functions that utilize a specifier object to target specific segmentations, viewports, and segments.

#### Removed Functions

- `getGlobalConfig`
- `setGlobalConfig`
- `getGlobalRepresentationConfig`
- `setGlobalRepresentationConfig`
- `getToolGroupSpecificConfig`
- `setToolGroupSpecificConfig`
- `getSegmentSpecificConfig`
- `setSegmentSpecificConfig`
- `getSegmentationRepresentationSpecificConfig`
- `setSegmentationRepresentationSpecificConfig`

#### New Functions

- `getStyle(specifier)`
- `setStyle(specifier, style)`
- `setRenderInactiveSegmentations(viewportId, renderInactiveSegmentations)`
- `getRenderInactiveSegmentations(viewportId)`
- `resetToGlobalStyle()`
- `hasCustomStyle(specifier)`

#### Getting Global Segmentation Config

<Tabs>
<TabItem value="Before" label="Before 📦" default>

```js
// Get the global segmentation config
const globalConfig = getGlobalConfig();

// Get global representation config for a specific representation type
const labelmapConfig = getGlobalRepresentationConfig(
  SegmentationRepresentations.Labelmap
);
```

</TabItem>
<TabItem value="After" label="After 🚀">

```js
// Get the global style for a specific representation type
const labelmapStyle = getStyle({ type: SegmentationRepresentations.Labelmap });
```

</TabItem>
</Tabs>

##### Setting Global Segmentation Config

<Tabs>
<TabItem value="Before" label="Before 📦" default>

```js
// Set the global segmentation config
setGlobalConfig(newGlobalConfig);

// Set global representation config for a specific representation type
setGlobalRepresentationConfig(
  SegmentationRepresentations.Labelmap,
  newLabelmapConfig
);
```

</TabItem>
<TabItem value="After" label="After 🚀">

```js
// Set the global style for a specific representation type
setStyle({ type: SegmentationRepresentations.Labelmap }, newLabelmapStyle);
```

</TabItem>
</Tabs>

#### Getting and Setting ToolGroup-Specific Config

ToolGroup-specific configurations have been removed in favor of viewport-specific styles. The following will set the style for a specific viewport and specific segmentation.

<Tabs>
<TabItem value="Before" label="Before 📦" default>

```js
// Get toolGroup-specific config
const toolGroupConfig = getToolGroupSpecificConfig(toolGroupId);

// Set toolGroup-specific config
setToolGroupSpecificConfig(toolGroupId, newToolGroupConfig);
```

</TabItem>
<TabItem value="After" label="After 🚀">

```js
// Set style for a specific viewport and segmentation representation
setStyle(
  {
    viewportId: 'viewport1',
    segmentationId: 'segmentation1',
    type: SegmentationRepresentations.Labelmap,
  },
  newLabelmapStyle
);

// Get style for a specific viewport and segmentation representation
const style = getStyle({
  viewportId: 'viewport1',
  segmentationId: 'segmentation1',
  type: SegmentationRepresentations.Labelmap,
});
```

</TabItem>
</Tabs>

#### Getting and Setting Segmentation Representation-Specific Config

In Cornerstone3D version 2.x, the functions for getting and setting segmentation representation-specific configurations have been replaced with a unified style management API. The old functions:

`getSegmentationRepresentationSpecificConfig`
`setSegmentationRepresentationSpecificConfig`

are no longer available. Instead, you should use the getStyle and setStyle functions with a specifier object to target specific segmentations and representations.

<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```js
// Get segmentation representation-specific config
const representationConfig = getSegmentationRepresentationSpecificConfig(
  toolGroupId,
  segmentationRepresentationUID
);

// Set segmentation representation-specific config
setSegmentationRepresentationSpecificConfig(
  toolGroupId,
  segmentationRepresentationUID,
  {
    LABELMAP: {
      renderOutline: true,
      outlineWidth: 2,
    },
  }
);
```

</TabItem>
<TabItem value="After" label="After 🚀🚀">

```js
// Get style for a specific segmentation representation
const style = getStyle({
  segmentationId: 'segmentation1',
  type: SegmentationRepresentations.Labelmap,
});

// Set style for a specific segmentation representation in all viewports
setStyle(
  {
    segmentationId: 'segmentation1',
    type: SegmentationRepresentations.Labelmap,
  },
  {
    renderOutline: true,
    outlineWidth: 2,
  }
);
```

</TabItem>
</Tabs>

#### Getting and Setting Segment-Specific Config

<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```js
// Get segment-specific config
const segmentConfig = getSegmentSpecificConfig(
  toolGroupId,
  segmentationRepresentationUID,
  segmentIndex
);

// Set segment-specific config
setSegmentSpecificConfig(
  toolGroupId,
  segmentationRepresentationUID,
  segmentIndex,
  newSegmentConfig
);
```

</TabItem>
<TabItem value="After" label="After 🚀">

```js
// Set style for a specific segment
setStyle(
  {
    segmentationId: 'segmentation1',
    type: SegmentationRepresentations.Labelmap,
    segmentIndex: 1,
  },
  newSegmentStyle
);

// Get style for a specific segment
const segmentStyle = getStyle({
  segmentationId: 'segmentation1',
  type: SegmentationRepresentations.Labelmap,
  segmentIndex: 1,
});
```

</TabItem>
</Tabs>

#### Setting Render Inactive Segmentations

The function to enable or disable rendering of inactive segmentations has been updated.

**Before**

This was part of the segmentation configuration:

```js
setGlobalConfig({ renderInactiveSegmentations: true });
```

**After**

Use `setRenderInactiveSegmentations`:

```js
// Set whether to render inactive segmentations in a viewport
setRenderInactiveSegmentations(viewportId, true);

// Get whether inactive segmentations are rendered in a viewport
const renderInactive = getRenderInactiveSegmentations(viewportId);
```

#### Resetting to Global Style

To reset all segmentation styles to the global style:

```js
resetToGlobalStyle();
```

#### Example Migration

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
import {
  getGlobalConfig,
  getGlobalRepresentationConfig,
  getToolGroupSpecificConfig,
  setGlobalConfig,
  setGlobalRepresentationConfig,
  setToolGroupSpecificConfig,
  setSegmentSpecificConfig,
  getSegmentSpecificConfig,
  setSegmentationRepresentationSpecificConfig,
  getSegmentationRepresentationSpecificConfig,
} from './segmentationConfig';

// Get the global segmentation config
const globalConfig = getGlobalConfig();

// Set global representation config
setGlobalRepresentationConfig(SegmentationRepresentations.Labelmap, {
  renderOutline: true,
  outlineWidth: 2,
});

// Set toolGroup-specific config
setToolGroupSpecificConfig(toolGroupId, {
  representations: {
    LABELMAP: {
      renderOutline: false,
    },
  },
});

// Set segment-specific config
setSegmentSpecificConfig(
  toolGroupId,
  segmentationRepresentationUID,
  segmentIndex,
  {
    LABELMAP: {
      renderFill: false,
    },
  }
);
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
import {
  getStyle,
  setStyle,
  setRenderInactiveSegmentations,
  getRenderInactiveSegmentations,
  resetToGlobalStyle,
  hasCustomStyle,
} from '@cornerstonejs/core';

// Get the global style for Labelmap representation
const labelmapStyle = getStyle({ type: SegmentationRepresentations.Labelmap });

// Set the global style for Labelmap representation
setStyle(
  { type: SegmentationRepresentations.Labelmap },
  {
    renderOutline: true,
    outlineWidth: 2,
  }
);

// Set style for a specific viewport and segmentation
setStyle(
  {
    viewportId: 'viewport1',
    segmentationId: 'segmentation1',
    type: SegmentationRepresentations.Labelmap,
  },
  {
    renderOutline: false,
  }
);

// Set style for a specific segment
setStyle(
  {
    segmentationId: 'segmentation1',
    type: SegmentationRepresentations.Labelmap,
    segmentIndex: segmentIndex,
  },
  {
    renderFill: false,
  }
);

// Set render inactive segmentations for a viewport
setRenderInactiveSegmentations('viewport1', true);

// Get render inactive segmentations setting for a viewport
const renderInactive = getRenderInactiveSegmentations('viewport1');

// Reset all styles to global
resetToGlobalStyle();
```

  </TabItem>
</Tabs>

---

#### Summary

- **Unified Style Management**: The new `getStyle` and `setStyle` functions provide a unified way to manage segmentation styles across different levels—global, segmentation-specific, viewport-specific, and segment-specific.
- **Specifier Object**: The `specifier` object allows you to target specific viewports, segmentations, and segments.
  - `type` is required
  - if `segmentationId` is provided, the style will be applied to the specific segmentation representation in all viewports
  - if `segmentationId` and `segmentIndex` are provided, the style will be applied to the specific segment of the specific segmentation representation
  - if `viewportId` is provided, the style will be applied to all segmentations in the specific viewport
  - if `viewportId`, `segmentationId`, and `segmentIndex` are provided, the style will be applied to the specific segment of the specific segmentation in the specific viewport
- **Hierarchy of Styles**: The effective style is determined by a hierarchy that considers global styles, segmentation-specific styles, and viewport-specific styles.

### Active

#### Viewport-based Operations

The API now uses viewport IDs instead of tool group IDs for identifying the context of segmentation operations.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function getActiveSegmentationRepresentation(toolGroupId: string);

function getActiveSegmentation(toolGroupId: string);

function setActiveSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string
);
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function getActiveSegmentation(viewportId: string);

function setActiveSegmentation(
  viewportId: string,
  segmentationId: string,
  suppressEvent: boolean = false
);
```

  </TabItem>
</Tabs>

#### Migration Steps:

1. Replace all instances of `toolGroupId` with `viewportId` in function calls.
2. Update `getActiveSegmentationRepresentation` and `getActiveSegmentation` calls to use the new `getActiveSegmentation` function.
3. Replace `setActiveSegmentationRepresentation` calls with `setActiveSegmentation`, using the new parameter structure.

#### Return Type Changes

The return type of `getActiveSegmentation` has changed from an implicit `undefined` to an explicit `Segmentation` type.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function getActiveSegmentation(toolGroupId: string);
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function getActiveSegmentation(viewportId: string): Segmentation;
```

  </TabItem>
</Tabs>

#### Migration Steps:

1. Replace all calls to `getActiveSegmentationRepresentation` with `getActiveSegmentation`.
2. Update any code that relied on the `ToolGroupSpecificRepresentation` type to work with the `Segmentation` type instead.

These changes aim to simplify the API and make it more intuitive to use. By focusing on viewport-based operations and removing the distinction between segmentation representations and segmentations, the new API should be easier to work with while maintaining the core functionality of the library.

### Visibility

#### Viewport-Centric Approach

The API now focuses on viewports rather than tool groups, reflecting a shift in the library's architecture.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function setSegmentationVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  visibility: boolean
): void {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function setSegmentationRepresentationVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type?: SegmentationRepresentations;
  },
  visibility: boolean
): void {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Replace `toolGroupId` with `viewportId` in function calls.
2. Use a `specifier` object instead of `segmentationRepresentationUID`.
3. Include `segmentationId` in the `specifier` object.
4. Optionally specify the `type` of segmentation representation.

#### Segmentation Representation Types

Version 2 introduces the concept of segmentation representation types, allowing for more granular control over different representation styles.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function getSegmentationVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string
): boolean | undefined {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function getSegmentationRepresentationVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): boolean | undefined {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update function names from `getSegmentationVisibility` to `getSegmentationRepresentationVisibility`.
2. Replace `toolGroupId` with `viewportId`.
3. Use a `specifier` object with `segmentationId` and `type` instead of `segmentationRepresentationUID`.

#### Segment-Level Visibility Control

The API for controlling individual segment visibility has been updated to align with the new viewport-centric approach.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function setSegmentVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number,
  visibility: boolean
): void {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function setSegmentIndexVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type?: SegmentationRepresentations;
  },
  segmentIndex: number,
  visibility: boolean
): void {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update function names from `setSegmentVisibility` to `setSegmentIndexVisibility`.
2. Replace `toolGroupId` with `viewportId`.
3. Use a `specifier` object with `segmentationId` and optional `type` instead of `segmentationRepresentationUID`.

#### New Utility Functions

Version 2 introduces new utility functions for managing segmentation visibility.

```typescript
function getHiddenSegmentIndices(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): Set<number> {
  // ...
}
```

This new function allows you to retrieve a set of hidden segment indices for a specific segmentation representation.

#### Removed Functions

The following functions have been removed in version 2:

- `setSegmentsVisibility`
- `getSegmentVisibility`

Replace usage of these functions with the new API methods described above.

<details>
<summary>Why?</summary>

Since the visibility should be set on the representation, and segmentation is not the owner of the visibility, a segmentation can have
two representations with different visibility on each viewport

</details>

### Locking

#### Retrieving Locked Segments

The function to retrieve locked segments has been renamed and its implementation changed:

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function getLockedSegments(segmentationId: string): number[] | [];
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function getLockedSegmentIndices(segmentationId: string): number[] | [];
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update all calls from `getLockedSegments` to `getLockedSegmentIndices`.
2. Be aware that the implementation now uses `Object.keys` and `filter` instead of converting a Set to an array.

### Color

#### Viewport-Centric Approach

The API has shifted from a tool group-based approach to a viewport-centric one. This change affects several function signatures and how segmentations are referenced.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function setColorLUT(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  colorLUTIndex: number
): void {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function setColorLUT(
  viewportId: string,
  segmentationId: string,
  colorLUTsIndex: number
): void {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Replace `toolGroupId` with `viewportId` in function calls.
2. Replace `segmentationRepresentationUID` with `segmentationId`.
3. Update any code that relies on tool group-based segmentation management to use viewport-based management instead.

#### Color LUT Management

The `addColorLUT` function now returns the index of the added color LUT and has an optional `colorLUTIndex` parameter.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function addColorLUT(colorLUT: Types.ColorLUT, colorLUTIndex: number): void {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function addColorLUT(colorLUT: Types.ColorLUT, colorLUTIndex?: number): number {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update calls to `addColorLUT` to handle the returned index if needed.
2. Make the `colorLUTIndex` parameter optional in function calls.

#### Segment Color Retrieval and Setting

The functions for getting and setting segment colors have been renamed and their signatures updated to align with the new viewport-centric approach.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function getColorForSegmentIndex(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number
): Types.Color {
  // ...
}

function setColorForSegmentIndex(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number,
  color: Types.Color
): void {
  // ...
}
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function getSegmentIndexColor(
  viewportId: string,
  segmentationId: string,
  segmentIndex: number
): Types.Color {
  // ...
}

function setSegmentIndexColor(
  viewportId: string,
  segmentationId: string,
  segmentIndex: number,
  color: Types.Color
): void {
  // ...
}
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Rename `getColorForSegmentIndex` to `getSegmentIndexColor`.
2. Rename `setColorForSegmentIndex` to `setSegmentIndexColor`.
3. Update function calls to use `viewportId` instead of `toolGroupId`.
4. Replace `segmentationRepresentationUID` with `segmentationId` in function calls.

### Other Changes

#### Renaming

```js
getSegmentAtWorldPoint-- > getSegmentIndexAtWorldPoint;
getSegmentAtLabelmapBorder-- > getSegmentIndexAtLabelmapBorder;
```

#### getToolGroupIdsWithSegmentation

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function getToolGroupIdsWithSegmentation(segmentationId: string): string[];
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function getViewportIdsWithSegmentation(segmentationId: string): string[];
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Replace `getToolGroupIdsWithSegmentation` with `getViewportIdsWithSegmentation`.

#### Segmentation Representation Management

The way segmentation representations are added, retrieved, and removed has changed significantly.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```typescript
function addSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentation: ToolGroupSpecificRepresentation,
  suppressEvents?: boolean
): void;

function getSegmentationRepresentationByUID(
  toolGroupId: string,
  segmentationRepresentationUID: string
): ToolGroupSpecificRepresentation | undefined;

function removeSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void;
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```typescript
function addSegmentationRepresentation(
  viewportId: string,
  segmentationRepresentation: SegmentationRepresentation,
  suppressEvents?: boolean
): void;

function getSegmentationRepresentation(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): SegmentationRepresentation | undefined;

function removeSegmentationRepresentation(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  },
  immediate?: boolean
): void;
```

  </TabItem>
</Tabs>

**Migration Steps:**

1. Update all calls to `addSegmentationRepresentation` to use `viewportId` instead of `toolGroupId`.
2. Replace `getSegmentationRepresentationByUID` with `getSegmentationRepresentation`, using the new specifier object.
3. Update `removeSegmentationRepresentation` calls to use the new specifier object instead of `segmentationRepresentationUID`.

### PolySEG

#### Import

The PolySEG has been unbundled and placed in a separate external package. To use it, add the `peerImport` function to your `init` function for Cornerstone Core.

```js
async function peerImport(moduleId) {
  if (moduleId === '@icr/polyseg-wasm') {
    return import('@icr/polyseg-wasm');
  }
}

import { init } from '@cornerstonejs/core';

await init({ peerImport });
```

#### Options

You don't need to provide polyseg options for the segmentation representation. It will automatically use PolySeg if the specified representation is unavailable.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
await segmentation.addSegmentationRepresentations(toolGroupId2, [
  {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
    options: {
      polySeg: {
        enabled: true,
      },
    },
  },
]);
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
await segmentation.addSegmentationRepresentations(viewportId2, [
  {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
  },
]);
```

  </TabItem>
</Tabs>

#### Actor UID for labelmaps

The way the actorUID is generated has changed to use a combination of segmentationId and SegmentationRepresentations.Labelmap.
<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```js
const volumeInputs: Types.IVolumeInput[] = [
  {
    volumeId: labelMapData.volumeId,
    actorUID: segmentationRepresentationUID,
    visibility,
    blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
  },
];
```

</TabItem>
<TabItem value="After" label="After 🚀">

```js
const volumeInputs: Types.IVolumeInput[] = [
  {
    volumeId,
    actorUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}`,
    visibility,
    blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
  },
];
```

</TabItem>
</Tabs>

We've updated the `actorUID` to `${segmentationId}-${SegmentationRepresentations.Labelmap}`. This change allows us to uniquely identify representations without relying on the `segmentationRepresentationUID`.

For this mean, `getSegmentationActor` is added for you to get the actor for a given labelmap

```ts
export function getSegmentationActor(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): Types.VolumeActor | Types.ImageActor | undefined;
```

### New Utilities

`clearSegmentValue` is added to clear a specific segment value in a segmentation,
it will make the segment value to 0

```js
 function clearSegmentValue(
  segmentationId: string,
  segmentIndex: number
)
```

## Renaming and Nomenclature

### Types

PointsManager is now IPointsManager

migration

```js
import { IPointsManager } from '@cornerstonejs/tools/types';
```

### Units

#### getCalibratedLengthUnitsAndScale Signature

It is highly unlikely that you were using this function directly, but if you were, here's the migration
The return type of the function has changed slightly, with `units` and `areaUnits` renamed to `unit` and `areaUnit` respectively.

<Tabs>
<TabItem value="Before" label="Before 📦 " default>

```typescript
const getCalibratedLengthUnitsAndScale = (image, handles) => {
  // ...
  return { units, areaUnits, scale };
};
```

</TabItem>
<TabItem value="After" label="After 🚀">

```typescript
const getCalibratedLengthUnitsAndScale = (image, handles) => {
  // ...
  return { unit, areaUnit, scale };
};
```

</TabItem>
</Tabs>

#### getModalityUnit -> getPixelValueUnits

To make more sense

<details>
<summary>Why?</summary>
There was too much inconsistency in the units used throughout the library. We had `unit`, `areaUnits`, `modalityUnit`, and various others. Now, we have consolidated these units. You need to update your codebase to reflect the new unit system if you are hydrating annotations for Cornerstone3D.

In addition modalityUnit is now pixelValueUnits to reflect the correct term, since for a single modality there can be multiple pixel values (e.g, PT SUV, PT RAW, PT PROC)

</details>

### BasicStatsCalculator

the option `noPointsCollection` has been renamed to `storePointData`

### getSegmentAtWorldPoint -> getSegmentIndexAtWorldPoint

### getSegmentAtLabelmapBorder -> getSegmentIndexAtLabelmapBorder

---

## Others

### roundNumber

The utility has been relocated from `@cornerstonejs/tools` utilities to `@cornerstonejs/core/utilities`.
migration

```js
import { roundNumber } from '@cornerstonejs/core/utilities';
```

### jumpToSlice

The utility has been relocated from `@cornerstonejs/tools` utilities to `@cornerstonejs/core/utilities`.
migration

```js
import { jumpToSlice } from '@cornerstonejs/core/utilities';
```

### pointInShapeCallback

### 1. New Import Path

The `pointInShapeCallback` function has been moved. Update your imports as follows:

```js
import { pointInShapeCallback } from '@cornerstonejs/core/utilities';
```

### 2. Updated Usage

The function signature has changed to use an options object for improved clarity and flexibility. Below is a guide to how the usage has changed.

**Old Usage:**

```js
const pointsInShape = pointInShapeCallback(
  imageData,
  shapeFnCriteria,
  (point) => {
    // callback logic for each point
  },
  boundsIJK
);
```

**New Usage:**

```js
const pointsInShape = pointInShapeCallback(imageData, {
  pointInShapeFn: shapeFnCriteria,
  callback: (point) => {
    // callback logic for each point
  },
  boundsIJK: boundsIJK,
  returnPoints: true, // Optionally, to return the points inside the shape
});
```

### Key Changes:

- **Options Object**: Configuration parameters such as `pointInShapeFn`, `callback`, `boundsIJK`, and `returnPoints` are now passed through an options object.
- **Return Points**: Use the `returnPoints` option to specify if you want to return the points within the shape, previously it was always returning the points. If you relied on returning points directly, make sure to include `storePointData: true` in the tool options when you active it
