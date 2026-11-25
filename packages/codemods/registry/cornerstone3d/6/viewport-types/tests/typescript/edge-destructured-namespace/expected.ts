import * as cornerstone3D from '@cornerstonejs/core';
import * as other from './other';

const { Enums } = cornerstone3D;
const { ViewportType } = Enums;
const { Enums: CoreEnums } = cornerstone3D;
const SameEnums = cornerstone3D.Enums;
const { Enums: OtherEnums } = other;

export const types = [
  ViewportType.STACK,
  Enums.ViewportType.ORTHOGRAPHIC,
  CoreEnums.ViewportType.PLANAR,
  SameEnums.ViewportType.VOLUME_3D,
  OtherEnums.ViewportType.STACK,
];

export function shadowed(Enums: { ViewportType: { STACK: string } }) {
  return Enums.ViewportType.STACK;
}
