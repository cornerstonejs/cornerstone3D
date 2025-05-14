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
  const currentThreshold = getThresholdValue(volumeActor);
  updateOpacityWithThreshold(volumeActor, newOpacity, currentThreshold);
}

/**
 * Updates only the threshold while preserving opacity
 */
export function updateThreshold(volumeActor, newThreshold) {
  const currentOpacity = getMaxOpacity(volumeActor);
  updateOpacityWithThreshold(volumeActor, currentOpacity, newThreshold);
}

/**
 * Helper function to update opacity function with threshold
 * @param {Object} volumeActor - The volume actor to update
 * @param {number} opacity - The opacity value to set (0-1)
 * @param {number|null} threshold - The absolute threshold value (not normalized)
 */
function updateOpacityWithThreshold(volumeActor, opacity, threshold) {
  const transferFunction = volumeActor.getProperty().getRGBTransferFunction(0);
  const range = transferFunction.getRange();
  const ofun = vtkPiecewiseFunction.newInstance();

  if (threshold !== null) {
    // Small delta for sharp threshold transition
    const delta = Math.abs(range[1] - range[0]) * 0.001;

    // Make sure threshold is within range
    const thresholdValue = Math.max(range[0], Math.min(range[1], threshold));

    // Create points for the piecewise function
    ofun.addPoint(range[0], 0);
    ofun.addPoint(thresholdValue - delta, 0);
    ofun.addPoint(thresholdValue, opacity);
    ofun.addPoint(range[1], opacity);
  } else {
    // Simple uniform opacity without threshold
    ofun.addPoint(range[0], opacity);
    ofun.addPoint(range[1], opacity);
  }

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
  registerColormap,
  findMatchingColormap,
  getThresholdValue,
  getMaxOpacity,
};
