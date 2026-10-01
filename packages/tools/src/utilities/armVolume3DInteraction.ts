import {
  beginVolume3DInteraction,
  endVolume3DInteraction,
  getEnabledElement,
} from '@cornerstonejs/core';

/**
 * Arms legacy Volume3D interactive quality for the element (fixed sample-
 * distance factor or Target FPS, per viewport policy), and restores full
 * quality on mouseup / touchend / touchcancel.
 *
 * Under `fixedSampleDistance`, optional `sampleDistanceFactor` is applied
 * when it is a finite number > 0; otherwise the default ×2 is used.
 * Under `targetFps`, the factor is ignored.
 *
 * Returns true when interaction quality was armed.
 */
export default function armVolume3DInteraction(
  element: HTMLDivElement,
  options?: { sampleDistanceFactor?: number }
): boolean {
  const enabledElement = getEnabledElement(element);
  if (!enabledElement?.viewport) {
    return false;
  }

  const { viewport } = enabledElement;
  if (!beginVolume3DInteraction(viewport.id, options)) {
    return false;
  }

  const cleanup = () => {
    document.removeEventListener('mouseup', cleanup);
    document.removeEventListener('touchend', cleanup);
    document.removeEventListener('touchcancel', cleanup);
    if (endVolume3DInteraction(viewport.id)) {
      viewport.render();
    }
  };

  document.addEventListener('mouseup', cleanup, { once: true });
  document.addEventListener('touchend', cleanup, { once: true });
  document.addEventListener('touchcancel', cleanup, { once: true });
  return true;
}
