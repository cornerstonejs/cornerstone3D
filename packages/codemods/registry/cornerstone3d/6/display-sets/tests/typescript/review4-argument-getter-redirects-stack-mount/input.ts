import type { Types } from '@cornerstonejs/core';

export async function getterInTheList(
  first: Types.IViewport,
  second: Types.IViewport
) {
  let viewport = first;
  const holder = {
    get images() {
      viewport = second;

      return ['image'];
    },
  };

  await (viewport as Types.IStackViewport).setStack(holder.images);
}

export async function callInTheIndex(
  first: Types.IViewport,
  second: Types.IViewport,
  imageIds: string[]
) {
  let viewport = first;
  const pick = () => {
    viewport = second;

    return 0;
  };

  await (viewport as Types.IStackViewport).setStack(imageIds, pick());
}

export async function writtenParameter(
  viewport: Types.IViewport,
  next: () => string[]
) {
  await (viewport as Types.IStackViewport).setStack(next());
  viewport = undefined;
}

export async function plainArguments(
  first: Types.IViewport,
  imageIds: string[]
) {
  let viewport = first;

  await (viewport as Types.IStackViewport).setStack(imageIds, 2);
  viewport = undefined;
}
