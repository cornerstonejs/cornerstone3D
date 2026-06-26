---
id: region-segment-plus
title: Region Segment Plus (one-click segmentation)
---

# Region Segment Plus — migration from `origin/main`

If you integrated **one-click segmentation** using `RegionSegmentPlusTool` from the `origin/main` branch (or an equivalent release), this guide describes what changed and how to update your application.

## Summary

| Topic                  | `origin/main`                                            | Current                                                                          |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Primary algorithm      | GPU **grow cut** (`runOneClickGrowCut`)                  | **Intensity flood fill** with automatic band estimation                          |
| Recommended tool class | `RegionSegmentPlusTool`                                  | `RegionSegmentPlusFloodFillTool`                                                 |
| Tool name (`toolName`) | `RegionSegmentPlus`                                      | `RegionSegmentPlusFloodFill`                                                     |
| Legacy grow cut        | (only option)                                            | `RegionSegmentPlusGrowCutTool` (`RegionSegmentPlusGrowCut`) — **deprecated**     |
| Hover before click     | Always on (~500 ms stability + seed heuristics)          | Off by default; optional via `hoverPrecheckEnabled`                              |
| Cursor feedback        | `copy` / `not-allowed` from positive/negative seed ratio | `copy` / `not-allowed` from intensity-band preview (when hover precheck enabled) |

The old grow-cut one-click behavior is still available as a **separate, deprecated** tool for comparison or gradual rollout. New integrations should use the flood-fill tool.

## What changed

### Algorithm and UX

On `origin/main`, a single click ran **grow cut** after a mandatory hover gate:

1. Mouse had to rest briefly (`mouseStabilityDelay`, default 500 ms).
2. `calculateGrowCutSeeds` sampled positive/negative seeds around the click.
3. Clicks were blocked when the positive/negative seed ratio was poor (e.g. ratio > 20:1 or fewer than 30 negative seeds).
4. Segmentation used `growCut.runOneClickGrowCut` with precomputed `seeds`.

The current default path uses **3D intensity flood fill**:

1. An **intensity band** is derived at click time (and optionally during hover) via `intensityRangeStrategy` — e.g. canvas-disk sampling from the rendered viewport, mean ±σ in a neighborhood, or fixed percentage around the click value.
2. Voxels within that band are flood-filled in the referenced volume, with optional **external/internal island removal** and optional bounds (`maxDeltaK`, `maxDeltaIJ`, `planar`).
3. Hover precheck is **disabled by default**; clicks segment immediately without waiting for a stable hover.

### Tool split

`RegionSegmentPlusTool` on `origin/main` was one class. It is now split:

| Export                           | `toolName`                   | Role                                      |
| -------------------------------- | ---------------------------- | ----------------------------------------- |
| `RegionSegmentPlusFloodFillTool` | `RegionSegmentPlusFloodFill` | **Use this** for new work                 |
| `RegionSegmentPlusGrowCutTool`   | `RegionSegmentPlusGrowCut`   | Deprecated; matches old grow-cut behavior |
| `RegionSegmentPlusTool`          | (re-exports flood fill)      | **Deprecated** import alias only          |

Register and add tools by their new classes/names. Do not assume `toolName === 'RegionSegmentPlus'` unless you keep an explicit alias in your app.

## Migration steps

### 1. Register the flood-fill tool

```javascript
import { addTool, RegionSegmentPlusFloodFillTool } from '@cornerstonejs/tools';

addTool(RegionSegmentPlusFloodFillTool);
```

To keep the legacy grow-cut tool available (not recommended for new features):

```javascript
import { RegionSegmentPlusGrowCutTool } from '@cornerstonejs/tools';

addTool(RegionSegmentPlusGrowCutTool);
```

### 2. Update tool groups and bindings

**Before (`origin/main`):**

```javascript
toolGroup.addTool(RegionSegmentPlusTool.toolName);
toolGroup.setToolActive(RegionSegmentPlusTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Primary }],
});
```

**After:**

```javascript
toolGroup.addTool(RegionSegmentPlusFloodFillTool.toolName);
toolGroup.setToolActive(RegionSegmentPlusFloodFillTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Primary }],
});
```

Replace every reference to the string `'RegionSegmentPlus'` in `hasTool`, `setToolConfiguration`, `getToolInstance`, and toolbar/evaluate hooks with `'RegionSegmentPlusFloodFill'` (or your own alias that maps to that name).

### 3. Replace configuration

Remove any `segmentationMode` option (it applied only to the transitional combined implementation, not to `origin/main`).

**`origin/main` configuration (grow cut only):**

```javascript
{
  isPartialVolume: false,
  positiveSeedVariance: 0.4,
  negativeSeedVariance: 0.9,
  subVolumePaddingPercentage: 0.1,
  islandRemoval: { enabled: false },
  mouseStabilityDelay: 500, // implicit default for hover gate
}
```

**Recommended flood-fill configuration:**

```javascript
{
  hoverPrecheckEnabled: false,
  intensityRangeStrategy: 'canvasDiskTriClassLarge', // or object form; see below
  maxDeltaK: 25,
  maxDeltaIJ: 100,
  planar: false,
  floodFillIslandRemoval: {
    removeExternalIslands: true,
    removeInternalIslands: true,
    verboseLogging: false,
  },
}
```

`intensityRangeStrategy` accepts a string shorthand (e.g. `'meanStdMapped'`, `'canvasDiskTriClassLarge'`, `'fixedPercent10'`) or an object:

```javascript
intensityRangeStrategy: {
  strategy: 'canvasDiskTriClass',
  canvasDiskRadiusPx: 10,
}
```

Built-in strategies are resolved in `@cornerstonejs/tools` via `intensityRangeStrategyGetters`; you can supply a custom `getIntensityRange` on the object form for advanced cases.

To approximate the old “hover then click when allowed” workflow:

```javascript
{
  hoverPrecheckEnabled: true,
  mouseStabilityDelay: 500,
  // ... flood-fill options as above
}
```

### 4. Optional: keep grow-cut one-click temporarily

If you must preserve `origin/main` behavior during a transition period:

```javascript
toolGroup.addTool(RegionSegmentPlusGrowCutTool.toolName);
toolGroup.setToolConfiguration(RegionSegmentPlusGrowCutTool.toolName, {
  positiveSeedVariance: 0.4,
  negativeSeedVariance: 0.9,
  subVolumePaddingPercentage: 0.1,
  islandRemoval: { enabled: false },
});
```

No `intensityRangeStrategy`, `maxDeltaK`, or `floodFillIslandRemoval` settings apply to this tool.

### 5. Cancel in progress (flood fill)

`RegionSegmentPlusFloodFillTool` supports Escape to cancel a long-running flood fill via the standard tool `actions` configuration (enabled in the default tool props). Wire keyboard bindings the same way as other interactive tools if you customize `actions`.

## Behavioral differences to expect

- **No seed-ratio gate by default** — flood fill does not use `calculateGrowCutSeeds` unless you select the deprecated grow-cut tool.
- **VOI / window matters** — canvas-disk strategies sample from the **displayed** viewport; changing window/level can change the inferred band.
- **Slice / in-plane limits** — tune `maxDeltaK` (through-slice) and `maxDeltaIJ` (in-plane) to control how far the fill propagates; these replace implicit grow-cut sub-volume behavior for many workflows.
- **Island cleanup** — external/internal island removal is flood-fill specific; grow-cut island removal on the deprecated tool still uses `islandRemoval.enabled` on the base grow-cut path.

## OHIF and downstream apps

OHIF’s segmentation mode registers **`RegionSegmentPlusFloodFillTool` only** and maps its internal `toolNames.RegionSegmentPlus` key to `RegionSegmentPlusFloodFill`. Toolbar flood-fill sliders (`maxDeltaK`, `maxDeltaIJ`) target that tool. The deprecated grow-cut tool is not registered in OHIF.

If you maintain a fork or extension that still referenced `RegionSegmentPlus` with grow cut, align with the flood-fill tool name and configuration above.

## Examples

The **Region Segment Plus** example (`regionSegmentPlus`) defaults to the flood-fill tool and offers a dropdown to switch to **Region Segment Plus (grow cut) (deprecated)** for side-by-side comparison.

## Related API

- `runFloodFillSegmentation` — flood-fill implementation and logging
- `RegionSegmentIntensityRangeStrategy` — exported type for strategy shorthands
- `getCanvasDiskRadiusPxForStrategy` — helper for disk-radius strategies

For other segmentation tools (brush, scissors, threshold ROI), see [Segmentation Tools](../../concepts/cornerstone-tools/segmentation/segmentation-tools.md).
