import { utilities as csUtilities } from '@cornerstonejs/core';

import type { configElement } from './createElement';
import createElement from './createElement';
import addLabelToToolbar from './addLabelToToolbar';

interface configSlider extends configElement {
  id?: string;
  title: string;
  defaultValue: number;
  container?: HTMLElement;
  onSelectedValueChange: (value: string) => void;
  updateLabelOnChange?: (value: string, label: HTMLElement) => void;
  label?: configElement;
}

export type DeleteFn = () => void;

export default function addSliderToToolbar(config: configSlider): DeleteFn {
  config = csUtilities.deepMerge(config, config.merge);

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
      type: 'number',
      name: config.title,
    },
    event: {
      input: fnInput,
    },
  });

  if (config.id) {
    elInput.id = config.id;
  }

  elInput.value = String(config.defaultValue);

  return () => {
    elLabel.remove();
    elInput.remove();
  };
}
