import { getEnabledElement, type Types } from '@cornerstonejs/core';

interface Holder {
  viewport: Types.IViewport;
  images: string[];
}

export async function fromGetter(holder: Holder) {
  await (holder.viewport as Types.IStackViewport).setStack(holder.images, 1);
}

export async function fromEnabledElement(
  element: HTMLDivElement,
  ids: string[]
) {
  const enabledElement = getEnabledElement(element);

  await enabledElement.viewport.setStack(ids);
}
