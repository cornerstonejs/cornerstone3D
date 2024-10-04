---
id: config
title: Config
---

In this section we will explain various ways you can change the tool styles. This
includes various properties such as `color` when `selected`, `highlighted`, or `locked`;
textbox color, line dash style and thickness and more.

## Style Hierarchy

We will start by looking at the style hierarchy. The style hierarchy is as follow.

- Annotation-level settings (with UID) **set/getAnnotationToolStyle**
  - Viewport-level tool settings **set/getViewportToolStyle**
    - Per-tool this layer: Length on this viewport
    - Global this layer: All tools in this viewport
      - toolGroup settings (for any tool specified in this toolGroup in all viewports of the toolGroup) **set/getToolGroupToolStyle**
        - Per-tool layer: Angle on this toolGroup in all viewports
        - Global this layer: All tools in this toolGroup in all viewports
          - Default level: **set/getDefaultToolStyle**
            - Per-tool layer (Length) settings
            - Global (app-level) settings (we provide a default).

In annotation rendering loop, upon getting a style for a certain property (`color`, `lineDash`, `lineThickness`)
we check whether the style is set at the annotation level (highest priority).
If not, we check whether any viewport-level setting is set (for the viewport annotation is drawing on); however,
in the viewportLevel, we first check whether the tool-level setting is set. If not, we check in the "global" (all tools in the viewport) level.
If not found, we move to the next level for toolGroup level. If not found, we move to the next level for global level which is last
level to check.

![configs](../../../assets/configs.png)

## Default Setting

`Cornerstone3DTools` initializes a default settings for toolsStyles class that can be found in `packages/tools/src/stateManagement/annotation/config/ToolStyle.ts`

```js
{
  color: 'rgb(255, 255, 0)',
  colorHighlighted: 'rgb(0, 255, 0)',
  colorSelected: 'rgb(0, 220, 0)',
  colorLocked: 'rgb(255, 255, 0)',
  lineWidth: '1',
  lineDash: '',
  textBoxVisibility: true,
  textBoxFontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
  textBoxFontSize: '14px',
  textBoxColor: 'rgb(255, 255, 0)',
  textBoxColorHighlighted: 'rgb(0, 255, 0)',
  textBoxColorSelected: 'rgb(0, 255, 0)',
  textBoxColorLocked: 'rgb(255, 255, 0)',
  textBoxBackground: '',
  textBoxLinkLineWidth: '1',
  textBoxLinkLineDash: '2,3',
};
```

However, you can adjust each of the above parameters along with other styles that we will discuss next.

## Set styles

Each level of the style hierarchy has a set of styles that can be set. The styles are as follow.

### Annotation-level settings

```js
import { annotations } from '@cornerstonejs/tools';

// Annotation Level
const styles = {
  colorHighlighted: 'rgb(255, 255, 0)',
};

annotation.config.style.setAnnotationToolStyle(annotationUID, style);
```

### Viewport-level tool settings

```js
// Viewport Level
const styles = {
  LengthTool: {
    colorHighlighted: 'rgb(255, 255, 0)',
  },
  global: {
    lineWidth: '2',
  },
};

annotation.config.style.setViewportToolStyle(viewportId, styles);
```

### ToolGroup-level tool settings

```js
const styles = {
  LengthTool: {
    colorHighlighted: 'rgb(255, 255, 0)',
  },
  global: {
    lineWidth: '2',
  },
};

annotation.config.style.setToolGroupToolStyles(toolGroupId, styles);
```

### Global(Default)-level tool settings

```js
const styles = annotation.config.style.getDefaultToolStyle();

const newStyles = {
  ProbeTool: {
    colorHighlighted: 'rgb(255, 255, 0)',
  },
  global: {
    lineDash: '2,3',
  },
};

annotation.config.style.setDefaultToolStyle(deepMerge(styles, newStyles));
```

### Configurable Styles

Currently we have the following styles that can be configured.

```js
color;
colorActive;
colorHighlighted;
colorHighlightedActive;
colorHighlightedPassive;
colorLocked;
colorLockedActive;
colorLockedPassive;
colorPassive;
colorSelected;
colorSelectedActive;
colorSelectedPassive;
lineDash;
lineDashActive;
lineDashHighlighted;
lineDashHighlightedActive;
lineDashHighlightedPassive;
lineDashLocked;
lineDashLockedActive;
lineDashLockedPassive;
lineDashPassive;
lineDashSelected;
lineDashSelectedActive;
lineDashSelectedPassive;
lineWidth;
lineWidthActive;
lineWidthHighlighted;
lineWidthHighlightedActive;
lineWidthHighlightedPassive;
lineWidthLocked;
lineWidthLockedActive;
lineWidthLockedPassive;
lineWidthPassive;
lineWidthSelected;
lineWidthSelectedActive;
lineWidthSelectedPassive;
textBoxBackground;
textBoxBackgroundActive;
textBoxBackgroundHighlighted;
textBoxBackgroundHighlightedActive;
textBoxBackgroundHighlightedPassive;
textBoxBackgroundLocked;
textBoxBackgroundLockedActive;
textBoxBackgroundLockedPassive;
textBoxBackgroundPassive;
textBoxBackgroundSelected;
textBoxBackgroundSelectedActive;
textBoxBackgroundSelectedPassive;
textBoxColor;
textBoxColorActive;
textBoxColorHighlighted;
textBoxColorHighlightedActive;
textBoxColorHighlightedPassive;
textBoxColorLocked;
textBoxColorLockedActive;
textBoxColorLockedPassive;
textBoxColorPassive;
textBoxColorSelected;
textBoxColorSelectedActive;
textBoxColorSelectedPassive;
textBoxFontFamily;
textBoxFontFamilyActive;
textBoxFontFamilyHighlighted;
textBoxFontFamilyHighlightedActive;
textBoxFontFamilyHighlightedPassive;
textBoxFontFamilyLocked;
textBoxFontFamilyLockedActive;
textBoxFontFamilyLockedPassive;
textBoxFontFamilyPassive;
textBoxFontFamilySelected;
textBoxFontFamilySelectedActive;
textBoxFontFamilySelectedPassive;
textBoxFontSize;
textBoxFontSizeActive;
textBoxFontSizeHighlighted;
textBoxFontSizeHighlightedActive;
textBoxFontSizeHighlightedPassive;
textBoxFontSizeLocked;
textBoxFontSizeLockedActive;
textBoxFontSizeLockedPassive;
textBoxFontSizePassive;
textBoxFontSizeSelected;
textBoxFontSizeSelectedActive;
textBoxFontSizeSelectedPassive;
textBoxLinkLineDash;
textBoxLinkLineDashActive;
textBoxLinkLineDashHighlighted;
textBoxLinkLineDashHighlightedActive;
textBoxLinkLineDashHighlightedPassive;
textBoxLinkLineDashLocked;
textBoxLinkLineDashLockedActive;
textBoxLinkLineDashLockedPassive;
textBoxLinkLineDashPassive;
textBoxLinkLineDashSelected;
textBoxLinkLineDashSelectedActive;
textBoxLinkLineDashSelectedPassive;
textBoxLinkLineWidth;
textBoxLinkLineWidthActive;
textBoxLinkLineWidthHighlighted;
textBoxLinkLineWidthHighlightedActive;
textBoxLinkLineWidthHighlightedPassive;
textBoxLinkLineWidthLocked;
textBoxLinkLineWidthLockedActive;
textBoxLinkLineWidthLockedPassive;
textBoxLinkLineWidthPassive;
textBoxLinkLineWidthSelected;
textBoxLinkLineWidthSelectedActive;
textBoxLinkLineWidthSelectedPassive;
```
