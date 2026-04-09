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
  options:
    | (optionTypeDefaultValue & optionTypeValues)
    | Promise<optionTypeDefaultValue & optionTypeValues>;
  onSelectedValueChange: (key: number | string, value?: any) => void;
  toolGroupId?: string | string[];
  label?: configElement;
  labelText?: string;
  container?: HTMLElement;
}

function applyDropdownOptions(
  elSelect: HTMLSelectElement,
  options: optionTypeDefaultValue & optionTypeValues
): Map<string | number, any> | undefined {
  const {
    map,
    values = [...map.keys()],
    labels,
    defaultValue,
    defaultIndex = defaultValue === undefined && 0,
  } = options as any;

  const existingPlaceholder = elSelect.querySelector('option[data-loading="true"]');
  if (existingPlaceholder) {
    existingPlaceholder.remove();
  }

  while (elSelect.options.length > 0) {
    elSelect.remove(0);
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

  return map;
}

export default function addDropDownToToolbar(config: configDropdown): void {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

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

  let currentMap: Map<string | number, any> | undefined;

  //
  const fnChange = (evt: Event) => {
    const elSelect = <HTMLSelectElement>evt.target;
    const { value: key } = elSelect;
    if (elSelect) {
      config.onSelectedValueChange(key, currentMap?.get(key));
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

  const maybePromise = config.options as
    | (optionTypeDefaultValue & optionTypeValues)
    | Promise<optionTypeDefaultValue & optionTypeValues>;
  if (typeof (maybePromise as Promise<unknown>)?.then === 'function') {
    elSelect.disabled = true;
    const elLoadingOption = document.createElement('option');
    elLoadingOption.value = '';
    elLoadingOption.innerText = 'Loading...';
    elLoadingOption.selected = true;
    elLoadingOption.dataset.loading = 'true';
    elSelect.append(elLoadingOption);

    (maybePromise as Promise<optionTypeDefaultValue & optionTypeValues>)
      .then((resolvedOptions) => {
        currentMap = applyDropdownOptions(elSelect, resolvedOptions);
      })
      .catch((error) => {
        console.error('addDropdownToToolbar: failed to resolve options', error);
        const elErrorOption = document.createElement('option');
        elErrorOption.value = '';
        elErrorOption.innerText = 'Failed to load';
        elErrorOption.selected = true;
        while (elSelect.options.length > 0) {
          elSelect.remove(0);
        }
        elSelect.append(elErrorOption);
      })
      .finally(() => {
        elSelect.disabled = false;
      });
  } else {
    currentMap = applyDropdownOptions(
      elSelect,
      maybePromise as optionTypeDefaultValue & optionTypeValues
    );
  }

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
