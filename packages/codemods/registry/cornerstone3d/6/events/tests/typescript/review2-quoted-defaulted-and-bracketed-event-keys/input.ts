import { Enums } from '@cornerstonejs/core';

const { 'STACK_NEW_IMAGE': onImage } = Enums.Events;
const { VOLUME_NEW_IMAGE = 'fallback' } = Enums.Events;
const { 'PRE_STACK_NEW_IMAGE': onPre } = Enums.Events;
const { ['IMAGE_LOAD_ERROR']: onError } = Enums.Events;
const { ...allEvents } = Enums.Events;

window.addEventListener(onImage, () => undefined);
window.addEventListener(VOLUME_NEW_IMAGE, () => undefined);
window.addEventListener(onPre, () => undefined);
window.addEventListener(onError, () => undefined);
window.addEventListener(Enums.Events['STACK_NEW_IMAGE'], () => undefined);
window.addEventListener(Enums.Events["STACK_VIEWPORT_SCROLL"], () => undefined);
console.log(allEvents);
