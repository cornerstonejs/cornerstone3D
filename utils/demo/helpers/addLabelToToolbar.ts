import createElement, { configElement } from './createElement';

interface configLabel extends configElement {
  id?: string;
  title: string;
  container?: HTMLElement;
}

export default function addLabelToToolbar(
  config: configLabel
): HTMLLabelElement {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const label = <HTMLLabelElement>createElement({
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
