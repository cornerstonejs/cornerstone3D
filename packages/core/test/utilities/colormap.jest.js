import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';

import { findMatchingColormap } from '../../src/utilities/colormap';

describe('findMatchingColormap', () => {
  it('handles actors without a scalar opacity function', () => {
    const presetName = vtkColorMaps.rgbPresetNames[0];
    const preset = vtkColorMaps.getPresetByName(presetName);
    const actor = {
      isA: (type) => type === 'vtkImageSlice',
      getProperty: () => ({
        getScalarOpacity: () => null,
      }),
    };

    expect(() => findMatchingColormap(preset.RGBPoints, actor)).not.toThrow();
    expect(findMatchingColormap(preset.RGBPoints, actor)).toEqual({
      name: preset.Name,
    });
  });
});
