import { Enums } from '@cornerstonejs/core';

const {
  STACK: STACK_VIEW,
  PLANAR_NEXT,
  VOLUME_3D_NEXT: THREE_D,
} = Enums.ViewportType;

export const options = {
  viewportId: 'A',
  element: document.body,
  type: STACK_VIEW,
};
export const planar = {
  viewportId: 'B',
  element: document.body,
  type: PLANAR_NEXT,
};
export const threeD = THREE_D;
