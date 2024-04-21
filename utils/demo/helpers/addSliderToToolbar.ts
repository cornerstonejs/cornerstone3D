import { utilities } from '@cornerstonejs/core';

import createElement, { configElement } from './createElement';
import addLabelToToolbar from './addLabelToToolbar';

interface configSlider extends configElement {
  id?: string;
  title: string;
  range: number[];
  step?: number;
  defaultValue: number;
  container?: HTMLElement;
  onSelectedValueChange: (value: string) => void;
  updateLabelOnChange?: (value: string, label: HTMLElement) => void;
  label?: configElement;
}

export default function addSliderToToolbar(config: configSlider): void {
  config = utilities.deepMerge(config, config.merge);

  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  //
  const elLabel = addLabelToToolbar({
    merge: config.label,
    title: config.title,
    container: config.container,
  });

  if (config.id) {
    elLabel.id = `${config.id}-label`;
  }

  elLabel.htmlFor = config.title;

  //
  const fnInput = (evt: Event) => {
    const selectElement = <HTMLSelectElement>evt.target;

    if (selectElement) {
      config.onSelectedValueChange(selectElement.value);

      if (config.updateLabelOnChange !== undefined) {
        config.updateLabelOnChange(selectElement.value, elLabel);
      }
    }
  };

  //
  const elInput = <HTMLInputElement>createElement({
    merge: config,
    tag: 'input',
    attr: {
      type: 'range',
      name: config.title,
    },
    event: {
      input: fnInput,
    },
  });

  if (config.id) {
    elInput.id = config.id;
  }

  // Add step before setting its value to make sure it works for step different than 1.
  // Example: range (0-1), step (0.1) and value (0.5)
  if (config.step) {
    elInput.step = String(config.step);
  }

  elInput.min = String(config.range[0]);
  elInput.max = String(config.range[1]);

  elInput.value = String(config.defaultValue);
}
