import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

import type { ColormapPublic, ColormapRegistration } from '../types';
import isEqual from './isEqual';
import { actorIsA } from './actorCheck';

const _colormaps = new Map();

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

/**
 * Finds a colormap that matches the given RGB points.
 *
 * @param rgbPoints - The RGB points to match against the colormaps.
 * @returns  The matched colormap object or null if no match is found.
 */
function findMatchingColormap(rgbPoints, actor): ColormapPublic | null {
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

  const opacity = [];
  if (actorIsA(actor, 'vtkVolume')) {
    const opacityPoints = actor
      .getProperty()
      .getScalarOpacity(0)
      .getDataPointer();

    if (!opacityPoints) {
      return {
        name: matchedColormap.Name,
      };
    }

    for (let i = 0; i < opacityPoints.length; i += 2) {
      opacity.push({
        value: opacityPoints[i],
        opacity: opacityPoints[i + 1],
      });
    }
  }

  return {
    name: matchedColormap.Name,
    opacity,
  };
}

/**
 * Sets the colormap transfer function for a volume actor, including initial opacity and threshold.
 *
 * @param volumeInfo - Information about the volume, including the actor, preset, opacity, threshold, and color range.
 */
function setColorMapTransferFunctionForVolumeActor(volumeInfo) {
  const {
    volumeActor,
    preset,
    opacity = 0.9,
    threshold = 0.02,
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
 * Updates only the opacity value while preserving threshold.
 *
 * @param volumeActor - The vtkVolume actor.
 * @param newOpacity - The new maximum opacity value.
 */
function updateOpacity(volumeActor, newOpacity) {
  const currentThreshold = getThresholdValue(volumeActor);
  updateOpacityWithThreshold(volumeActor, newOpacity, currentThreshold);
}

/**
 * Updates only the threshold value while preserving the maximum opacity.
 *
 * @param volumeActor - The vtkVolume actor.
 * @param newThreshold - The new threshold value (normalized 0-1).
 */
function updateThreshold(volumeActor, newThreshold) {
  const currentOpacity = getMaxOpacity(volumeActor);
  updateOpacityWithThreshold(volumeActor, currentOpacity, newThreshold);
}

/**
 * Helper function to update opacity function with threshold.
 *
 * @param volumeActor - The vtkVolume actor.
 * @param opacity - The maximum opacity value.
 * @param threshold - The threshold value (normalized 0-1).
 */
function updateOpacityWithThreshold(volumeActor, opacity, threshold) {
  const transferFunction = volumeActor.getProperty().getRGBTransferFunction(0);
  const range = transferFunction.getRange();
  const ofun = vtkPiecewiseFunction.newInstance();

  if (threshold > 0 && threshold < 1) {
    const thresholdValue = range[0] + (range[1] - range[0]) * threshold;
    // Small delta for sharp threshold, ensuring it's not zero if range is small
    const delta = Math.max((range[1] - range[0]) * 0.0001, 1e-6);

    ofun.addPoint(range[0], 0);
    ofun.addPoint(thresholdValue - delta, 0);
    ofun.addPoint(thresholdValue, opacity);
    ofun.addPoint(range[1], opacity);
  } else {
    // Simple uniform opacity without threshold or full range threshold
    ofun.addPoint(range[0], opacity);
    ofun.addPoint(range[1], opacity);
  }

  volumeActor.getProperty().setScalarOpacity(0, ofun);
}

/**
 * Extract threshold value from the actor's opacity function.
 *
 * @param volumeActor - The vtkVolume actor.
 * @returns The threshold value (normalized 0-1), or 0 if no threshold is set.
 */
function getThresholdValue(volumeActor) {
  const opacityFunction = volumeActor.getProperty().getScalarOpacity(0);
  if (!opacityFunction) {
    return 0;
  }

  const transferFunction = volumeActor.getProperty().getRGBTransferFunction(0);
  if (!transferFunction) {
    return 0; // Need transfer function to determine range
  }
  const range = transferFunction.getRange();
  const dataArray = opacityFunction.getDataPointer();

  // Check if range is valid
  if (range[0] >= range[1]) {
    return 0;
  }

  // Need at least 4 points (2 pairs) for a threshold step: [min, 0, threshold-delta, 0, threshold, opacity, max, opacity]
  if (!dataArray || dataArray.length < 6) {
    return 0; // No threshold if simple opacity function or not enough points
  }

  // Find transition from 0 to non-zero opacity after the first point
  for (let i = 2; i < dataArray.length - 2; i += 2) {
    const x1 = dataArray[i];
    const y1 = dataArray[i + 1];
    const x2 = dataArray[i + 2];
    const y2 = dataArray[i + 3];

    if (y1 === 0 && y2 > 0) {
      // Found threshold point (x2) - normalize to [0,1] range
      const thresholdValue = (x2 - range[0]) / (range[1] - range[0]);
      // Clamp value between 0 and 1 to handle potential floating point inaccuracies
      return Math.max(0, Math.min(1, thresholdValue));
    }
  }

  return 0; // Default if no threshold transition found
}

/**
 * Extract maximum opacity value from actor's opacity function.
 *
 * @param volumeActor - The vtkVolume actor.
 * @returns The maximum opacity value found in the piecewise function.
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

  // Find maximum opacity value (y-component)
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
  registerColormap,
  findMatchingColormap,
  setColorMapTransferFunctionForVolumeActor,
  updateOpacity,
  updateThreshold,
};
