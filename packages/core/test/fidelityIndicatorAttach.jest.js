import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getConfiguration, setConfiguration } from '../src/init';
import ViewportType from '../src/enums/ViewportType';
import {
  detachFidelityIndicator,
  isVolumeFidelityViewport,
  maybeAttachFidelityIndicator,
} from '../src/RenderingEngine/helpers/fidelityIndicator';

function viewportStub({ type, requestedType, getActors = true } = {}) {
  const element = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'viewport-element';
  inner.style.overflow = 'hidden';
  element.appendChild(inner);

  return {
    id: 'vp-1',
    type,
    requestedType,
    element,
    getActors: getActors ? () => [] : undefined,
  };
}

describe('fidelityIndicator attach gates', () => {
  const original = getConfiguration();

  afterEach(() => {
    setConfiguration(original);
  });

  describe('isVolumeFidelityViewport', () => {
    it('accepts orthographic and volume3d (legacy and Next)', () => {
      expect(
        isVolumeFidelityViewport(
          viewportStub({ type: ViewportType.ORTHOGRAPHIC })
        )
      ).toBe(true);
      expect(
        isVolumeFidelityViewport(viewportStub({ type: ViewportType.VOLUME_3D }))
      ).toBe(true);
      expect(
        isVolumeFidelityViewport(
          viewportStub({ type: ViewportType.VOLUME_3D_NEXT })
        )
      ).toBe(true);
      expect(
        isVolumeFidelityViewport(
          viewportStub({
            type: ViewportType.PLANAR_NEXT,
            requestedType: ViewportType.ORTHOGRAPHIC,
          })
        )
      ).toBe(true);
    });

    it('rejects stack (including stack remapped to PLANAR_NEXT)', () => {
      expect(
        isVolumeFidelityViewport(viewportStub({ type: ViewportType.STACK }))
      ).toBe(false);
      expect(
        isVolumeFidelityViewport(
          viewportStub({
            type: ViewportType.PLANAR_NEXT,
            requestedType: ViewportType.STACK,
          })
        )
      ).toBe(false);
    });
  });

  describe('dangerouslyDisableFidelityIndicator', () => {
    beforeEach(() => {
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: true,
      });
    });

    it('does not attach DOM when the product indicator is disabled', () => {
      const viewport = viewportStub({ type: ViewportType.ORTHOGRAPHIC });

      maybeAttachFidelityIndicator(viewport);

      expect(viewport.element.querySelector('.fi-root')).toBeNull();
      expect(
        viewport.element.querySelector('.viewport-element .fi-root')
      ).toBeNull();
    });
  });

  describe('overlay host', () => {
    beforeEach(() => {
      setConfiguration({
        ...original,
        dangerouslyDisableFidelityIndicator: false,
      });
    });

    it('mounts on the outer element so tooltips are not inside overflow:hidden', () => {
      const viewport = viewportStub({ type: ViewportType.ORTHOGRAPHIC });

      maybeAttachFidelityIndicator(viewport);

      const root = viewport.element.querySelector(':scope > .fi-root');
      expect(root).not.toBeNull();
      expect(
        viewport.element.querySelector('.viewport-element .fi-root')
      ).toBeNull();

      detachFidelityIndicator(viewport);
      expect(viewport.element.querySelector('.fi-root')).toBeNull();
    });
  });
});
