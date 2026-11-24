import {
  Enums,
  VolumeViewport3D,
  utilities,
} from '@cornerstonejs/core';
import type { IGenericViewport } from '@cornerstonejs/core/types';
import { BaseViewport as Base } from '@cornerstonejs/core';

let isGeneric = utilities.isGenericViewport;

export function check(type: string, viewport: IGenericViewport) {
  const GenericViewport = 'a local name';
  const resolve = utilities['resolveViewportVolumeId'];

  return [
    type === Enums.ViewportType.PLANAR || type === Enums.ViewportType.PLANAR,
    Enums.ViewportType['VIDEO'],
    viewport instanceof VolumeViewport3D,
    viewport instanceof VolumeViewport3D,
    viewport instanceof Base,
    isGeneric(viewport),
    GenericViewport,
    resolve(viewport),
  ];
}

isGeneric = () => true;

export { isGenericViewport as isViewport } from '@cornerstonejs/core/utilities';
