import keyDownListener, { getModifierKey } from './keyDownListener'

function enable(enabledDomElement: HTMLElement): void {
  disable(enabledDomElement)
  enabledDomElement.addEventListener('keydown', keyDownListener)
}

function disable(enabledDomElement: HTMLElement): void {
  enabledDomElement.removeEventListener('keydown', keyDownListener)
}

export default {
  enable,
  disable,
  getModifierKey,
}
