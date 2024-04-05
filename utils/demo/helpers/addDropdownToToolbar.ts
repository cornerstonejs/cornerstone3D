import { Enums, ToolGroupManager } from '@cornerstonejs/tools';

import createElement, { configElement } from './createElement';
import addLabelToToolbar from './addLabelToToolbar';

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
  onSelectedValueChange: (key: number | string, value?: any) => void;
  toolGroupId?: string | string[];
  label?: configElement;
  labelText?: string;
  container?: HTMLElement;
}

const { MouseBindings } = Enums;

export default function addDropDownToToolbar(config: configDropdown): void {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const {
    map,
    values = [...map.keys()],
    defaultValue,
    defaultIndex = defaultValue === undefined && 0,
  } = config.options as any;

  // Create label element if labelText is provided
  if (config.label || config.labelText) {
    const label = addLabelToToolbar({
      merge: config.label,
      title: config.labelText,
      container: config.container,
    });

    if (config.id) {
      label.htmlFor = config.id;
    }
  }

  //
  const select = <HTMLSelectElement>createElement({
    merge: config,
    tag: 'select',
  });

  if (config.id) {
    select.id = config.id;
  }

  if (config.placeholder) {
    const optionElement = <HTMLOptionElement>createElement({
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

  select.onchange = (evt: Event) => {
    const selectElement = <HTMLSelectElement>evt.target;
    const { value: key } = selectElement;
    if (selectElement) {
      config.onSelectedValueChange(key, map?.get(key));
    }
  };
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
