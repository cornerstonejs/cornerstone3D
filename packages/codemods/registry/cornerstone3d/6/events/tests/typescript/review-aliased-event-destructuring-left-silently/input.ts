import { Enums } from '@cornerstonejs/core';

const { STACK_NEW_IMAGE: onImage } = Enums.Events;

window.addEventListener(onImage, () => undefined);
