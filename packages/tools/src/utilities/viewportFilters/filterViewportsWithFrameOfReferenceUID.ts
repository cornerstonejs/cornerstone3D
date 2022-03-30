import type { Types } from '@cornerstonejs/core';

/**
 * Given an array of viewports, returns a list of viewports that are viewing a
 * world space with the given `FrameOfReferenceUID`.
 *
 * @param viewports - An array of viewports.
 * @param FrameOfReferenceUID - The UID defining a particular world space/Frame Of Reference.
 *
 * @returns A filtered array of viewports.
 */
export default function filterViewportsWithFrameOfReferenceUID(
  viewports: Array<Types.IStackViewport | Types.IVolumeViewport>,
  FrameOfReferenceUID: string
): Array<Types.IStackViewport | Types.IVolumeViewport> {
  const numViewports = viewports.length;
  const viewportsWithFrameOfReferenceUID = [];

  for (let vp = 0; vp < numViewports; vp++) {
    const viewport = viewports[vp];

    if (viewport.getFrameOfReferenceUID() === FrameOfReferenceUID) {
      viewportsWithFrameOfReferenceUID.push(viewport);
    }
  }

  return viewportsWithFrameOfReferenceUID;
}
