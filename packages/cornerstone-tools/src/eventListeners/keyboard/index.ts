import keyListener from './keyListener'

function enable(element: HTMLElement): void {
  disable(element)
  element.addEventListener('keydown', keyListener)
}

function disable(element: HTMLElement): void {
  element.removeEventListener('keydown', keyListener)
}

export default {
  enable,
  disable,
}
