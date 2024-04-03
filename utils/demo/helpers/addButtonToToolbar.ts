import createElement, { configElement } from './createElement';

interface configButton extends configElement {
  id?: string;
  title: string;
  container?: HTMLElement;
  onClick: () => void;
}

export default function addButtonToToolbar(
  config: configButton = {
    title: undefined,
    onClick: undefined,
  }
) {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const button = createElement({
    tag: 'button',
    ...config,
  });

  if (config.id) {
    button.id = config.id;
  }

  if (config.title) {
    button.innerHTML = config.title;
  }

  if (config.onClick) {
    button.onclick = config.onClick;
  }

  return button;
}
