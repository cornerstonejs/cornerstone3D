import { utilities } from '@cornerstonejs/core';

import createElement, { configElement } from './createElement';

interface configButton extends configElement {
  id?: string;
  title: string;
  container?: HTMLElement;
  onClick: () => void;
}

export default function addButtonToToolbar(
  config: configButton
): HTMLButtonElement {
  config = utilities.deepMerge(config, config.merge);

  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const elButton = <HTMLButtonElement>createElement({
    merge: config,
    tag: 'button',
  });

  if (config.id) {
    elButton.id = config.id;
  }

  if (config.title) {
    elButton.innerHTML = config.title;
  }

  if (config.onClick) {
    elButton.onclick = config.onClick;
  }

  return elButton;
}
