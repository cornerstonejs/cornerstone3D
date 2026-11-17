jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    getEnabledElement: jest.fn(),
    getEnabledElementByIds: jest.fn(),
  };
});
jest.mock('../../core/src/getEnabledElement');

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { getEnabledElement, getEnabledElementByIds } from '@cornerstonejs/core';
import * as coreGetEnabledElement from '../../core/src/getEnabledElement';
import WSIViewport from '../../core/src/RenderingEngine/GenericViewport/WSI/WSIViewport';
import { mountNext, unmount } from '../../core/test/utils/wsiStandIn';
import StackScrollTool from '../src/tools/StackScrollTool';

describe('The stack scroll tool on a next viewport that has no slices', () => {
  let mounted;

  beforeEach(async () => {
    mounted = await mountNext(WSIViewport, 0.4);

    const enabledElement = {
      viewport: mounted.viewport,
      renderingEngineId: 're',
    };

    getEnabledElement.mockReturnValue(enabledElement);
    getEnabledElementByIds.mockReturnValue(enabledElement);
    coreGetEnabledElement.default.mockReturnValue(enabledElement);
  });

  afterEach(() => {
    unmount(mounted);
  });

  it('does nothing and does not throw on a direct next whole slide viewport, by the wheel and by a drag', () => {
    const { viewport, view, element } = mounted;
    const tool = new StackScrollTool();
    const resolution = view.getResolution();
    const center = view.getCenter();

    expect(viewport.scroll).toBeUndefined();
    expect(() => {
      tool._scroll({ detail: { wheel: { direction: 1 }, element } });
      tool._scroll({ detail: { wheel: { direction: -1 }, element } });
      tool._scrollDrag({
        detail: {
          deltaPoints: { canvas: [0, 200] },
          viewportId: viewport.id,
          renderingEngineId: 're',
        },
      });
    }).not.toThrow();

    expect(view.getResolution()).toBe(resolution);
    expect(view.getCenter()).toEqual(center);
  });

  it('takes a viewport that has no getNumberOfSlices as one slice for the length of a drag step', () => {
    const tool = new StackScrollTool();

    expect(tool._getPixelPerImage({ element: { offsetHeight: 600 } })).toBe(75);
    expect(
      tool._getPixelPerImage({
        element: { offsetHeight: 600 },
        getNumberOfSlices: () => 1,
      })
    ).toBe(75);
    expect(
      tool._getPixelPerImage({
        element: { offsetHeight: 600 },
        getNumberOfSlices: () => 100,
      })
    ).toBe(6);
  });
});
