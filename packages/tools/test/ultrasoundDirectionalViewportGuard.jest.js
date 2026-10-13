jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    getEnabledElement: jest.fn(),
  };
});

import { getEnabledElement } from '@cornerstonejs/core';
import UltrasoundDirectionalTool from '../src/tools/annotation/UltrasoundDirectionalTool';

const REJECTION = /can only be used on a viewport/;

const imageSliceMethods = {
  getCurrentImageId: () => 'imageId:1',
  getCurrentImageIdIndex: () => 0,
  getImageIds: () => ['imageId:1'],
  hasImageURI: () => true,
};

const volumeMethods = {
  addVolumes: () => undefined,
  setVolumes: () => undefined,
};

function attempt(viewport) {
  const tool = new UltrasoundDirectionalTool();
  const element = document.createElement('div');

  getEnabledElement.mockReturnValue({ viewport, element });

  try {
    tool.addNewAnnotation({
      detail: {
        currentPoints: { world: [0, 0, 0] },
        element,
      },
    });
  } catch (error) {
    return error;
  }

  return undefined;
}

/** Returns true when the tool rejected the viewport as unsupported. */
function rejects(viewport) {
  const error = attempt(viewport);

  return Boolean(error && REJECTION.test(error.message));
}

describe('UltrasoundDirectionalTool viewport guard', () => {
  it('accepts a legacy stack viewport', () => {
    expect(rejects({ ...imageSliceMethods })).toBe(false);
  });

  it('rejects a legacy volume viewport', () => {
    // The legacy VolumeViewport exposes all four image-slice methods, so a
    // capability guard alone accepts it. The volume methods separate it from a
    // stack viewport when the viewport cannot answer getCurrentMode.
    expect(rejects({ ...imageSliceMethods, ...volumeMethods })).toBe(true);
  });

  it('accepts a generic viewport that shows a stack', () => {
    // A generic PLANAR_NEXT viewport exposes the volume methods whatever it
    // shows, so the content mode has to decide.
    expect(
      rejects({
        ...imageSliceMethods,
        ...volumeMethods,
        getCurrentMode: () => 'stack',
      })
    ).toBe(false);
  });

  it('rejects a generic viewport that shows a volume', () => {
    expect(
      rejects({
        ...imageSliceMethods,
        ...volumeMethods,
        getCurrentMode: () => 'volume',
      })
    ).toBe(true);
  });

  it('rejects a generic viewport that shows a 3D volume', () => {
    expect(
      rejects({
        ...imageSliceMethods,
        ...volumeMethods,
        getCurrentMode: () => 'volume3d',
      })
    ).toBe(true);
  });

  it('accepts a waveform viewport', () => {
    expect(
      rejects({
        getWaveformData: () => ({}),
        getImageData: () => ({}),
      })
    ).toBe(false);
  });

  it('rejects a viewport that supports neither', () => {
    expect(rejects({ render: () => undefined })).toBe(true);
  });
});
