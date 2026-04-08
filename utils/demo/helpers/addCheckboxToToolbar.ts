import { utilities } from '@cornerstonejs/core';

import createElement, { configElement } from './createElement';

interface configCheckbox extends configElement {
  id?: string;
  title: string;
  checked?: boolean;
  container?: HTMLElement;
  onChange: (checked: boolean) => void;
  label?: configElement;
}

/**
 * One toolbar control per call: checkbox immediately left of its label text
 * (single flex item so rows like the segmentation example don’t interleave labels and boxes).
 */
export default function addCheckboxToToolbar(config: configCheckbox): void {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const fnChange = (evt: Event) => {
    const elInput = <HTMLInputElement>evt.target;

    if (config.onChange) {
      config.onChange(elInput.checked);
    }
  };

  const elLabel = <HTMLLabelElement>createElement({
    merge: utilities.deepMerge(
      {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
        },
      },
      config.label || {}
    ),
    tag: 'label',
    container: config.container,
  });

  if (config.id) {
    elLabel.id = `${config.id}-label`;
  }

  const { onChange, title, label, checked, container, id, merge, ...rest } =
    config;

  const elInput = <HTMLInputElement>createElement({
    merge: utilities.deepMerge(rest, merge || {}),
    tag: 'input',
    attr: {
      type: 'checkbox',
      name: title,
    },
    event: {
      change: fnChange,
    },
    container: elLabel,
  });

  if (id) {
    elInput.id = id;
  }

  // Boolean content attribute: setAttribute("checked", false) still leaves `checked`
  // present (e.g. value "false"), which keeps the box checked. Use the property.
  elInput.checked = !!checked;

  const textSpan = document.createElement('span');
  textSpan.innerHTML = title;
  elLabel.appendChild(textSpan);
}
