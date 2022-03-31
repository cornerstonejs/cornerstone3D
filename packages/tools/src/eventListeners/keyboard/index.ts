import keyDownListener, { getModifierKey } from './keyDownListener';

function enable(element: HTMLDivElement): void {
  disable(element);
  element.addEventListener('keydown', keyDownListener);
}

function disable(element: HTMLDivElement): void {
  element.removeEventListener('keydown', keyDownListener);
}

export default {
  enable,
  disable,
  getModifierKey,
};
