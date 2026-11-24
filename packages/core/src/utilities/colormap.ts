import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

import type { AppearanceColormap, ColormapRegistration } from '../types';
import type { OpacityMapping } from '../types/Colormap';
import isEqual from './isEqual';
import { actorIsA } from './actorCheck';
import { getOpacityRampPoints } from './opacityRamp';

/**
 * Per-actor opacity specification. The rendered scalar-opacity function is always derived from
 * these three orthogonal pieces, which means none of them can clobber another:
 *  - `overall`: a single scalar level, the `opacity` of the appearance.
 *  - `mapping`: an optional per-value shape, the `opacityMapping` of the colormap. Its per-point
 *    opacities are *scaled* by `overall` -> rendered_opacity(v) = overall * mapping(v).
 *  - `threshold`: an optional cutoff; values below it render fully transparent.
 *
 * It is kept off to the side (keyed by the volume actor) so that changing one piece (slider,
 * threshold, or the mapping) re-derives the function from the others instead of reading back the
 * already-collapsed function from the actor (which is what historically flattened arrays).
 */
interface OpacitySpec {
  overall: number;
  mapping?: readonly OpacityMapping[];
  threshold?: number | null;
}

const opacitySpecByActor = new WeakMap<object, OpacitySpec>();

/**
 * Returns the stored opacity spec for an actor, or a best-effort spec reconstructed from the
 * actor for volumes that were set up outside this system.
 */
function getOpacitySpec(volumeActor): OpacitySpec {
  const stored = opacitySpecByActor.get(volumeActor);
  if (stored) {
    return stored;
  }
  return {
    overall: getMaxOpacity(volumeActor),
    threshold: getThresholdValue(volumeActor),
  };
}

const _colormaps = new Map();

function normalizeColormapName(name?: string): string | undefined {
  return name?.trim().toLowerCase();
}

/**
 * Register a colormap
 * @param name - name of the colormap
 * @param colormap - colormap object
 */
function registerColormap(colormap: ColormapRegistration) {
  colormap.name = colormap.name || colormap.Name;
  _colormaps.set(colormap.name, colormap);
}

/**
 * Get a colormap by name
 * @param name - name of the colormap
 * @returns colormap object
 */
function getColormap(name) {
  return _colormaps.get(name);
}

/**
 * Get all registered colormap names
 * @returns array of colormap names
 *
 */
function getColormapNames() {
  return Array.from(_colormaps.keys());
}

function findRegisteredColormap(
  name: string
): ColormapRegistration | undefined {
  const exactMatch = getColormap(name);

  if (exactMatch) {
    return exactMatch;
  }

  const normalizedName = normalizeColormapName(name);

  if (!normalizedName) {
    return;
  }

  for (const [registeredName, registeredColormap] of _colormaps.entries()) {
    if (
      normalizeColormapName(registeredName) === normalizedName ||
      normalizeColormapName(registeredColormap.Name) === normalizedName
    ) {
      return registeredColormap;
    }
  }
}

function findVTKColormap(name: string): ColormapRegistration | undefined {
  const exactMatch = vtkColorMaps.getPresetByName(name);

  if (exactMatch) {
    return exactMatch as ColormapRegistration;
  }

  const normalizedName = normalizeColormapName(name);

  if (!normalizedName) {
    return;
  }

  const matchedPresetName = vtkColorMaps.rgbPresetNames.find(
    (presetName) => normalizeColormapName(presetName) === normalizedName
  );

  return matchedPresetName
    ? (vtkColorMaps.getPresetByName(matchedPresetName) as ColormapRegistration)
    : undefined;
}

function resolveColormap(name?: string): ColormapRegistration | undefined {
  if (!name?.trim()) {
    return;
  }

  return findRegisteredColormap(name) || findVTKColormap(name);
}

/**
 * Finds a colormap that matches the given RGB points.
 *
 * @param rgbPoints - The RGB points to match against the colormaps.
 * @returns  The matched colormap object or null if no match is found.
 */
function findMatchingColormap(rgbPoints, actor): AppearanceColormap | null {
  const colormapsVTK = vtkColorMaps.rgbPresetNames.map((presetName) =>
    vtkColorMaps.getPresetByName(presetName)
  );

  const colormapsCS3D = getColormapNames().map((colormapName) =>
    getColormap(colormapName)
  );

  const colormaps = colormapsVTK.concat(colormapsCS3D);

  // Find the colormap that matches the given RGB points
  const matchedColormap = colormaps.find((colormap) => {
    const { RGBPoints: presetRGBPoints } = colormap;

    if (presetRGBPoints.length !== rgbPoints.length) {
      return false;
    }

    for (let i = 0; i < presetRGBPoints.length; i += 4) {
      if (
        !isEqual(
          presetRGBPoints.slice(i + 1, i + 4),
          rgbPoints.slice(i + 1, i + 4)
        )
      ) {
        return false;
      }
    }

    return true;
  });

  if (!matchedColormap) {
    return null;
  }

  const opacityMapping: OpacityMapping[] = [];
  if (actorIsA(actor, 'vtkVolume') || actorIsA(actor, 'vtkImageSlice')) {
    const opacityPoints = actor
      .getProperty()
      ?.getScalarOpacity?.(0)
      ?.getDataPointer?.();

    if (!opacityPoints) {
      return {
        name: matchedColormap.Name,
      };
    }

    for (let i = 0; i < opacityPoints.length; i += 2) {
      opacityMapping.push({
        value: opacityPoints[i],
        opacity: opacityPoints[i + 1],
      });
    }
  }

  return {
    name: matchedColormap.Name,
    ...(opacityMapping.length > 0 && { opacityMapping }),
  };
}

export function setColorMapTransferFunctionForVolumeActor(volumeInfo) {
  const {
    volumeActor,
    preset,
    opacity = 0.9,
    threshold = null,
    colorRange = [0, 5],
  } = volumeInfo;
  const mapper = volumeActor.getMapper();
  mapper.setSampleDistance(1.0);

  // Set up color transfer function
  const cfun = vtkColorTransferFunction.newInstance();
  const presetToUse = preset || vtkColorMaps.getPresetByName('hsv');
  cfun.applyColorMap(presetToUse);
  cfun.setMappingRange(colorRange[0], colorRange[1]);
  volumeActor.getProperty().setRGBTransferFunction(0, cfun);

  // Set up opacity function with threshold
  updateOpacityWithThreshold(volumeActor, opacity, threshold);
}

/**
 * Updates only the opacity value while preserving threshold
 */
export function updateOpacity(volumeActor, newOpacity) {
  // newOpacity is the scalar "overall" level (e.g. the slider). Preserve the per-value mapping
  // and threshold and just re-scale.
  const spec = getOpacitySpec(volumeActor);
  applyOpacitySpec(volumeActor, { ...spec, overall: newOpacity });
}

/**
 * Updates only the threshold while preserving the overall level and the per-value mapping.
 */
export function updateThreshold(volumeActor, newThreshold) {
  const spec = getOpacitySpec(volumeActor);
  applyOpacitySpec(volumeActor, { ...spec, threshold: newThreshold });
}

/**
 * Updates the per-value opacity mapping (and optionally the overall level), preserving the
 * threshold. Pass `overall` to set both at once (e.g. when applying a synced colormap).
 */
export function updateOpacityMapping(
  volumeActor,
  mapping: readonly OpacityMapping[] | undefined,
  overall?: number
) {
  const spec = getOpacitySpec(volumeActor);
  applyOpacitySpec(volumeActor, {
    ...spec,
    mapping,
    ...(overall !== undefined && { overall }),
  });
}

/**
 * Reads back the current opacity spec for an actor in the shape of an appearance: a scalar
 * `opacity` (the overall level), the per-value `opacityMapping` of the colormap (if any), and
 * the `threshold`.
 */
export function getOpacityState(volumeActor): {
  opacity: number;
  opacityMapping?: readonly OpacityMapping[];
  threshold: number | null;
} {
  const spec = opacitySpecByActor.get(volumeActor);
  if (spec) {
    return {
      opacity: spec.overall,
      opacityMapping: spec.mapping,
      threshold: spec.threshold ?? null,
    };
  }
  return {
    opacity: getMaxOpacity(volumeActor),
    opacityMapping: undefined,
    threshold: getThresholdValue(volumeActor),
  };
}

/**
 * Derives and applies the scalar-opacity function from an opacity spec, then stores the spec on
 * the actor so later overall/threshold/mapping changes can re-derive without flattening. The
 * function follows the rule of every render path (`getOpacityRampPoints`); without a mapping it
 * spans the voxel range of the volume.
 */
function applyOpacitySpec(volumeActor, spec: OpacitySpec) {
  const overall = spec.overall ?? 1;
  const threshold = spec.threshold ?? null;
  const mapping = spec.mapping;

  opacitySpecByActor.set(volumeActor, { overall, mapping, threshold });

  if (mapping?.length) {
    setScalarOpacityPoints(
      volumeActor,
      getOpacityRampPoints({
        opacity: overall,
        opacityMapping: mapping,
        threshold,
      })
    );
    return;
  }

  updateOpacityWithThreshold(volumeActor, overall, threshold);
}

/**
 * Helper function to update opacity function with threshold
 * @param {Object} volumeActor - The volume actor to update
 * @param {number} opacity - The opacity value to set (0-1)
 * @param {number|null} threshold - The absolute threshold value (not normalized)
 */
function updateOpacityWithThreshold(volumeActor, opacity, threshold) {
  // there is always a voxel manager for each volume actor
  const meta = volumeActor.getMapper().getInputData().get('voxelManager');

  if (!meta?.voxelManager) {
    throw new Error(
      'No voxel manager was found for the volume actor, or you cannot yet update opacity with a threshold using stacked images'
    );
  }
  const range = meta.voxelManager.getRange();

  setScalarOpacityPoints(
    volumeActor,
    getOpacityRampPoints({ opacity, threshold }, [range[0], range[1]])
  );
}

function setScalarOpacityPoints(
  volumeActor,
  points: Array<[number, number]>
): void {
  const ofun = vtkPiecewiseFunction.newInstance();

  points.forEach(([value, opacity]) => ofun.addPoint(value, opacity));
  volumeActor.getProperty().setScalarOpacity(0, ofun);
}

/**
 * Extract threshold value from the actor's opacity function
 * @returns {number|null} The absolute threshold value or null if no threshold
 */
function getThresholdValue(volumeActor) {
  const opacityFunction = volumeActor.getProperty().getScalarOpacity(0);
  if (!opacityFunction) {
    return null;
  }

  const dataArray = opacityFunction.getDataPointer();

  if (!dataArray || dataArray.length <= 4) {
    return null; // No threshold if simple opacity function
  }

  // Find transition from 0 to non-zero opacity
  for (let i = 0; i < dataArray.length - 2; i += 2) {
    const x1 = dataArray[i];
    const y1 = dataArray[i + 1];
    const x2 = dataArray[i + 2];
    const y2 = dataArray[i + 3];

    if (y1 === 0 && y2 > 0) {
      // Found threshold point - return the actual value
      return x2;
    }
  }

  return null; // No threshold found
}

/**
 * Extract maximum opacity value from actor's opacity function
 */
function getMaxOpacity(volumeActor) {
  const opacityFunction = volumeActor.getProperty().getScalarOpacity(0);
  if (!opacityFunction) {
    return 1.0;
  }

  const dataArray = opacityFunction.getDataPointer();
  if (!dataArray || dataArray.length === 0) {
    return 1.0;
  }

  // Find maximum opacity value
  let maxOpacity = 0;
  for (let i = 1; i < dataArray.length; i += 2) {
    if (dataArray[i] > maxOpacity) {
      maxOpacity = dataArray[i];
    }
  }

  return maxOpacity;
}

export {
  getColormap,
  getColormapNames,
  resolveColormap,
  registerColormap,
  findMatchingColormap,
  getThresholdValue,
  getMaxOpacity,
};
