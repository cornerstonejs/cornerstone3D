import { Enums as csToolsEnums } from '@cornerstonejs/tools';
import { Enums } from '@cornerstonejs/core';

const Events = { STACK_NEW_IMAGE: 'mine' };
const { NEW_IMAGE, IMAGE_LOAD_FAILED } = Enums.Events;

element.addEventListener(Events.STACK_NEW_IMAGE, onMine);
element.addEventListener(csToolsEnums.Events.ANNOTATION_ADDED, onAnnotation);
element.addEventListener(NEW_IMAGE, onNewImage);
element.addEventListener(IMAGE_LOAD_FAILED, onLoadFailed);
