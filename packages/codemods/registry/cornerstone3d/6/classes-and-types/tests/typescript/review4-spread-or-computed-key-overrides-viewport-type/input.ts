import { Enums, RenderingEngine, type Types } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export function spreadAfterType(
  element: HTMLDivElement,
  overrides: Record<string, unknown>
) {
  engine.enableElement({
    viewportId: 'spread',
    type: Enums.ViewportType.VOLUME_3D,
    element,
    ...overrides,
  });

  return engine.getViewport('spread') as Types.IVolumeViewport;
}

export function computedKeyAfterType(
  element: HTMLDivElement,
  key: string,
  value: Enums.ViewportType
) {
  engine.enableElement({
    viewportId: 'computed',
    type: Enums.ViewportType.VOLUME_3D,
    element,
    [key]: value,
  });

  return engine.getViewport('computed') as Types.IVolumeViewport;
}

export function spreadAfterId(
  element: HTMLDivElement,
  overrides: Record<string, unknown>
) {
  engine.enableElement({
    viewportId: 'renamed',
    ...overrides,
    type: Enums.ViewportType.VOLUME_3D,
    element,
  });

  return engine.getViewport('renamed') as Types.IVolumeViewport;
}

export function typeFromSpread(
  first: HTMLDivElement,
  second: HTMLDivElement,
  base: Record<string, unknown>
) {
  engine.enableElement({
    viewportId: 'based',
    type: Enums.ViewportType.VOLUME_3D,
    element: first,
  });
  engine.enableElement({ ...base, viewportId: 'based', element: second });

  return engine.getViewport('based') as Types.IVolumeViewport;
}

export function spreadBeforeEntries(
  element: HTMLDivElement,
  defaults: Record<string, unknown>
) {
  engine.enableElement({
    ...defaults,
    viewportId: 'defaults',
    type: Enums.ViewportType.VOLUME_3D,
    element,
  });

  return engine.getViewport('defaults') as Types.IVolumeViewport;
}
