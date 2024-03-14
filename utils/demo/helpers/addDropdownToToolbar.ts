import { Enums, ToolGroupManager } from '@cornerstonejs/tools';

const { MouseBindings } = Enums;

export type optionTypeDefaultValue =
  | { defaultValue: number | string }
  | { defaultIndex?: number };

export type optionTypeValues =
  | { values: number[] | string[] }
  | { map: Map<string | number, any> };

export default function addDropDownToToolbar({
  id,
  options,
  container,
  style,
  onSelectedValueChange,
  labelText,
  toolGroupId,
}: {
  id?: string;
  options: optionTypeDefaultValue & optionTypeValues;
  container?: HTMLElement;
  style?: Record<string, any>;
  onSelectedValueChange?: (key: number | string, value?) => void;
  toolGroupId?: string | string[];
  labelText?: string;
}) {
  const {
    map,
    values = [...map.keys()],
    defaultValue,
    defaultIndex = defaultValue === undefined && 0,
  } = options as any;
  container = container ?? document.getElementById('demo-toolbar');

  if (!onSelectedValueChange && toolGroupId) {
    onSelectedValueChange = changeActiveTool.bind(
      null,
      Array.isArray(toolGroupId) ? toolGroupId : [toolGroupId]
    );
  }

  // Create label element if labelText is provided
  if (labelText) {
    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerText = labelText;
    container.append(label);
  }

  const select = document.createElement('select');
  select.id = id;

  if (style) {
    Object.assign(select.style, style);
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

  select.onchange = (evt) => {
    const selectElement = <HTMLSelectElement>evt.target;
    const { value: key } = selectElement;
    if (selectElement) {
      onSelectedValueChange(key, map?.get(key));
    }
  };

  container.append(select);
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
