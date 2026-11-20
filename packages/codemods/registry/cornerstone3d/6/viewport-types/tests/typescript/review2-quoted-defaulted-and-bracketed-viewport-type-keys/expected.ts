import { Enums } from '@cornerstonejs/core';

const { 'PLANAR': planar } = Enums.ViewportType;
const { VOLUME_3D: VOLUME_3D_NEXT = 'volume3d' } = Enums.ViewportType;
const { ['STACK']: stack } = Enums.ViewportType;
const { ...types } = Enums.ViewportType;
const orthographic = Enums.ViewportType['ORTHOGRAPHIC'];
const video = Enums.ViewportType["VIDEO_NEXT"];

console.log(planar, VOLUME_3D_NEXT, stack, types, orthographic, video);
