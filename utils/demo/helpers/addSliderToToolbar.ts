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
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  //
  const label = addLabelToToolbar({
    title: config.title,
    container: config.container,
    ...config.label,
  });

  if (config.id) {
    label.id = `${config.id}-label`;
  }

  label.htmlFor = config.title;

  //
  const fnInput = (evt: Event) => {
    const selectElement = <HTMLSelectElement>evt.target;

    if (selectElement) {
      config.onSelectedValueChange(selectElement.value);

      if (config.updateLabelOnChange !== undefined) {
        config.updateLabelOnChange(selectElement.value, label);
      }
    }
  };

  //
  const input = <HTMLInputElement>createElement({
    tag: 'input',
    attr: {
      type: 'range',
      name: config.title,
    },
    event: {
      input: fnInput,
    },
    ...config,
  });

  if (config.id) {
    input.id = config.id;
  }

  // Add step before setting its value to make sure it works for step different than 1.
  // Example: range (0-1), step (0.1) and value (0.5)
  if (config.step) {
    input.step = String(config.step);
  }

  input.min = String(config.range[0]);
  input.max = String(config.range[1]);

  input.value = String(config.defaultValue);
}
