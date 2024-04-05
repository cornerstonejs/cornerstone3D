import { utilities } from '@cornerstonejs/core';

import createElement, { configElement } from './createElement';

interface configLabel extends configElement {
  id?: string;
  title: string;
  container?: HTMLElement;
}

export default function addLabelToToolbar(
  config: configLabel
): HTMLLabelElement {
  config = utilities.deepMerge(config, config.merge);

  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const elLabel = <HTMLLabelElement>createElement({
    merge: config,
    tag: 'label',
  });

  if (config.id) {
    elLabel.id = config.id;
  }

  if (config.title) {
    elLabel.innerHTML = config.title;
  }

  return elLabel;
}
