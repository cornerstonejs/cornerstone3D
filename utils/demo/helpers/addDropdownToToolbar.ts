import { Enums as csToolsEnums, ToolGroupManager } from '@cornerstonejs/tools';
const { MouseBindings } = csToolsEnums;

import type { configElement } from './createElement';
import createElement from './createElement';
import addLabelToToolbar from './addLabelToToolbar';

export type optionTypeDefaultValue =
  | { defaultValue: number | string }
  | { defaultIndex?: number };

export type optionTypeValues =
  | { labels?: string[] }
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

export default function addDropDownToToolbar(config: configDropdown): void {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const {
    map,
    values = [...map.keys()],
    labels,
    defaultValue,
    defaultIndex = defaultValue === undefined && 0,
  } = config.options as any;

  // Create label element if labelText is provided
  if (config.label || config.labelText) {
    const elLabel = addLabelToToolbar({
      merge: config.label,
      title: config.labelText,
      container: config.container,
    });

    if (config.id) {
      elLabel.htmlFor = config.id;
    }
  }

  //
  if (!config.onSelectedValueChange && config.toolGroupId) {
    config.onSelectedValueChange = changeActiveTool.bind(
      null,
      Array.isArray(config.toolGroupId)
        ? config.toolGroupId
        : [config.toolGroupId]
    );
  }

  //
  const fnChange = (evt: Event) => {
    const elSelect = <HTMLSelectElement>evt.target;
    const { value: key } = elSelect;
    if (elSelect) {
      config.onSelectedValueChange(key, map?.get(key));
    }
  };

  //
  const elSelect = <HTMLSelectElement>createElement({
    merge: config,
    tag: 'select',
    event: {
      change: fnChange,
    },
  });

  if (config.id) {
    elSelect.id = config.id;
  }

  if (config.placeholder) {
    const elOption = <HTMLOptionElement>createElement({
      tag: 'option',
      attr: {
        disabled: '',
        hidden: '',
        selected: '',
      },
      html: config.placeholder,
    });
    elSelect.append(elOption);
  }

  values.forEach((value, index) => {
    const elOption = document.createElement('option');
    const stringValue = String(value);
    elOption.value = stringValue;
    elOption.innerText = labels?.[index] ?? stringValue;

    if (value === defaultValue || index === defaultIndex) {
      elOption.selected = true;

      if (map) {
        map.get(value).selected = true;
      }
    }

    elSelect.append(elOption);
  });

  return elSelect;
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
