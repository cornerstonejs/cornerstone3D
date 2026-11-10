import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import BaseVolumeViewport from '../src/RenderingEngine/BaseVolumeViewport';
import { InterpolationType } from '../src/enums';
import applyPreset from '../src/utilities/applyPreset';
import VIEWPORT_PRESETS from '../src/constants/viewportPresets';

// Every bundled preset sets interpolation "1", which applyPreset turns into
// fast linear.
const PRESET = 'CT-Coronary-Arteries-3';

/**
 * The part of a volume viewport that setProperties and setPreset use, with a
 * real vtkVolume actor.
 */
function createViewport() {
  const volumeActor = vtkVolume.newInstance();
  const viewport = Object.create(BaseVolumeViewport.prototype);

  Object.assign(viewport, {
    id: 'viewport',
    element: document.createElement('div'),
    viewportProperties: {},
    _getApplicableVolumeActor: () => ({ volumeActor, volumeId: 'volume' }),
    render: jest.fn(),
  });

  return { viewport, volumeActor };
}

function interpolationOf(volumeActor) {
  return volumeActor.getProperty().getInterpolationType();
}

describe('volume viewport preset and interpolation type', () => {
  it('a preset on its own still applies its interpolation', () => {
    const { volumeActor } = createViewport();
    volumeActor.getProperty().setInterpolationType(InterpolationType.NEAREST);

    applyPreset(
      volumeActor,
      VIEWPORT_PRESETS.find((preset) => preset.name === PRESET)
    );

    expect(interpolationOf(volumeActor)).toBe(InterpolationType.FAST_LINEAR);
  });

  it('keeps the interpolation type set on the viewport when a preset is applied later', () => {
    const { viewport, volumeActor } = createViewport();

    viewport.setInterpolationType(InterpolationType.NEAREST);
    viewport.setPreset(PRESET, 'volume', true);

    expect(interpolationOf(volumeActor)).toBe(InterpolationType.NEAREST);
    expect(viewport.viewportProperties.interpolationType).toBe(
      InterpolationType.NEAREST
    );
    expect(viewport.viewportProperties.preset).toBe(PRESET);
  });

  it('keeps the interpolation type when both are set in one setProperties call', () => {
    const { viewport, volumeActor } = createViewport();

    viewport.setProperties(
      { interpolationType: InterpolationType.NEAREST, preset: PRESET },
      'volume',
      true
    );

    expect(interpolationOf(volumeActor)).toBe(InterpolationType.NEAREST);
  });

  it('uses the preset interpolation when the viewport has no interpolation type', () => {
    const { viewport, volumeActor } = createViewport();
    volumeActor.getProperty().setInterpolationType(InterpolationType.NEAREST);

    viewport.setPreset(PRESET, 'volume', true);

    expect(interpolationOf(volumeActor)).toBe(InterpolationType.FAST_LINEAR);
  });
});
