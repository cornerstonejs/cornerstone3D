import keyDownListener, { getModifierKey } from './keyDownListener'

function enable(element: HTMLElement): void {
  disable(element)
  element.addEventListener('keydown', keyDownListener)
}

function disable(element: HTMLElement): void {
  element.removeEventListener('keydown', keyDownListener)
}

export default {
  enable,
  disable,
  getModifierKey,
}
