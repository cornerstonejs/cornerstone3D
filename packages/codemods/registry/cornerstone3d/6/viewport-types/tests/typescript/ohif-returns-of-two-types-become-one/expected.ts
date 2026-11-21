import { Enums } from '@cornerstonejs/core';

const { ViewportType } = Enums;

const STACK = 'stack';
const VOLUME = 'volume';
const VOLUME_3D = 'volume3d';

export default function getCornerstoneViewportType(
  viewportType: string,
  useNextViewports = false
): Enums.ViewportType {
  const lowerViewportType = viewportType.toLowerCase();

  switch (lowerViewportType) {
    case 'planarnext':
      return Enums.ViewportType.PLANAR;
    case 'volume3dnext':
      return Enums.ViewportType.VOLUME_3D;
  }

  if (useNextViewports) {
    switch (lowerViewportType) {
      case STACK:
      case VOLUME:
        return Enums.ViewportType.PLANAR;
      case VOLUME_3D:
        return Enums.ViewportType.VOLUME_3D;
      default:
        throw new Error(`Invalid viewport type: ${viewportType}`);
    }
  }

  if (lowerViewportType === STACK) {
    return Enums.ViewportType.PLANAR;
  }

  if (lowerViewportType === VOLUME) {
    return Enums.ViewportType.PLANAR;
  }

  if (lowerViewportType === VOLUME_3D) {
    return Enums.ViewportType.VOLUME_3D;
  }

  throw new Error(`Invalid viewport type: ${viewportType}`);
}

export function bySwitch(kind: string) {
  switch (kind) {
    case 'stack':
      return ViewportType.PLANAR;
    case 'volume':
      return ViewportType.PLANAR;
    default:
      return ViewportType.VOLUME_3D;
  }
}

export function byConstants(kind: string) {
  const stackType = ViewportType.PLANAR;
  const volumeType = ViewportType.PLANAR;

  if (kind === 'stack') {
    return stackType;
  }

  return volumeType;
}

const STACK_TYPE = ViewportType.PLANAR;
const VOLUME_TYPE = ViewportType.PLANAR;

export const byModuleConstants = (isStack: boolean) =>
  isStack ? STACK_TYPE : VOLUME_TYPE;

export function byVariablesWithOneValue(isStack: boolean) {
  let stackType = ViewportType.PLANAR;
  let volumeType = ViewportType.PLANAR;

  return isStack ? stackType : (volumeType as Enums.ViewportType);
}

export class Shapes {
  shapeOf(isStack: boolean) {
    if (isStack) {
      return ViewportType.PLANAR;
    }

    return ViewportType.PLANAR;
  }
}

export function assignedOnly(kind: string) {
  let type;

  if (kind === 'stack') {
    type = ViewportType.STACK;
  } else {
    type = ViewportType.ORTHOGRAPHIC;
  }

  return type;
}

export function assignedAfterTheDeclaration(kind: string) {
  let type = ViewportType.PLANAR;

  if (kind === 'volume') {
    type = ViewportType.ORTHOGRAPHIC;
  }

  return type;
}

export function writtenInAnotherWay(kinds: string[]) {
  let type = ViewportType.PLANAR;
  const volumeType = ViewportType.PLANAR;

  [type] = kinds as Enums.ViewportType[];

  return kinds.length ? type : volumeType;
}

export function inAConditional(isStack: boolean) {
  return isStack ? ViewportType.STACK : ViewportType.ORTHOGRAPHIC;
}

export function legacyAndNextThroughAVariable(useNext: boolean) {
  let type = ViewportType.VOLUME_3D;

  if (useNext) {
    type = ViewportType.VOLUME_3D;
  }

  return type;
}

export function legacyAndNextInAConditional(useNext: boolean) {
  return useNext ? ViewportType.VIDEO : ViewportType.VIDEO;
}

export function stackOnly() {
  return ViewportType.PLANAR;
}

export function volumeOnly() {
  return ViewportType.PLANAR;
}

export function sameTypeTwice(early: boolean) {
  if (early) {
    return ViewportType.PLANAR;
  }

  return ViewportType.PLANAR;
}

export function innerFunctionReturnsTheOther(kinds: string[]) {
  kinds.map(() => {
    return ViewportType.PLANAR;
  });

  return ViewportType.PLANAR;
}

export function alreadyOnSix(is3D: boolean) {
  if (is3D) {
    return ViewportType.VOLUME_3D;
  }

  return ViewportType.PLANAR;
}
