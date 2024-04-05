import createElement, { configElement } from './createElement';
import addLabelToToolbar from './addLabelToToolbar';

interface configCheckbox extends configElement {
  id?: string;
  title: string;
  checked?: boolean;
  container?: HTMLElement;
  onChange: (checked: boolean) => void;
  label?: configElement;
}

export default function addCheckboxToToolbar(config: configCheckbox): void {
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
  const fnChange = (evt: Event) => {
    const checkboxElement = <HTMLInputElement>evt.target;

    if (config.onChange) {
      config.onChange(checkboxElement.checked);
    }
  };

  //
  const elInput = <HTMLInputElement>createElement({
    merge: config,
    tag: 'input',
    attr: {
      type: 'checkbox',
      name: config.title,
      checked: !!config.checked,
    },
    event: {
      change: fnChange,
    },
  });

  if (config.id) {
    elInput.id = config.id;
  }
}
