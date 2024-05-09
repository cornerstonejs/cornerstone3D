import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';

import { ColormapPublic, ColormapRegistration } from '../types';
import isEqual from './isEqual';
import { actorIsA } from './actorCheck';

const _colormaps = new Map();

/**
 * Register a colormap
 * @param name - name of the colormap
 * @param colormap - colormap object
 */
function registerColormap(colormap: ColormapRegistration) {
  _colormaps.set(colormap.Name, colormap);
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

export {
  getColormap,
  getColormapNames,
  registerColormap,
  findMatchingColormap,
};
