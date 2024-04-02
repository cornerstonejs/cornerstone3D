import { Enums, ToolGroupManager } from '@cornerstonejs/tools';

import createElement, { configElement } from './createElement';

export type optionTypeDefaultValue =
  | { defaultValue: number | string }
  | { defaultIndex?: number };

export type optionTypeValues =
  | { values: number[] | string[] }
  | { map: Map<string | number, any> };

interface configDropdown extends configElement {
  id?: string;
  placeholder?: string;
  options: optionTypeDefaultValue & optionTypeValues;
  onSelectedValueChange?: (key: number | string, value?) => void;
  toolGroupId?: string | string[];
  label?: configElement;
  labelText?: string;
  container?: HTMLElement;
}

const { MouseBindings } = Enums;

export default function addDropDownToToolbar(
  config: configDropdown = {
    options: undefined,
  }
) {
  const {
    map,
    values = [...map.keys()],
    defaultValue,
    defaultIndex = defaultValue === undefined && 0,
  } = config.options as any;

  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  // Create label element if labelText is provided
  if (config.labelText) {
    const label = createElement({
      tag: 'label',
      html: config.labelText,
      ...config.label,
    });

    label.htmlFor = config.id;

    config.container.append(label);
  }

  const select = createElement({
    tag: 'select',
    ...config,
  });

  if (config.id) {
    select.id = config.id;
  }

  if (config.placeholder) {
    const optionElement = createElement({
      tag: 'option',
      attr: {
        disabled: '',
        hidden: '',
        selected: '',
      },
      html: config.placeholder,
    });
    select.append(optionElement);
  }

  values.forEach((value, index) => {
    const optionElement = document.createElement('option');
    const stringValue = String(value);
    optionElement.value = stringValue;
    optionElement.innerText = stringValue;

    if (value === defaultValue || index === defaultIndex) {
      optionElement.selected = true;
      if (map) {
        map.get(value).selected = true;
      }
    }

    select.append(optionElement);
  });

  if (!config.onSelectedValueChange && config.toolGroupId) {
    config.onSelectedValueChange = changeActiveTool.bind(
      null,
      Array.isArray(config.toolGroupId)
        ? config.toolGroupId
        : [config.toolGroupId]
    );
  }

  select.onchange = (evt) => {
    const selectElement = <HTMLSelectElement>evt.target;
    const { value: key } = selectElement;
    if (selectElement) {
      config.onSelectedValueChange(key, map?.get(key));
    }
  };

  config.container.append(select);
}

function changeActiveTool(toolGroupIds: string[], newSelectedToolName) {
  for (const toolGroupId of toolGroupIds) {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    const selectedToolName = toolGroup.getActivePrimaryMouseButtonTool();
    if (selectedToolName) {
      toolGroup.setToolPassive(selectedToolName);
    }

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });
  }
}
