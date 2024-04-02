import createElement, { configElement } from './createElement';

interface configLabel extends configElement {
  id?: string;
  title?: string;
  container?: HTMLElement;
}

export function addLabelToToolbar(config: configLabel = {}) {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const label = createElement({
    tag: 'label',
    ...config,
  });

  if (config.id) {
    label.id = config.id;
  }

  if (config.title) {
    label.innerHTML = config.title;
  }

  return label;
}
