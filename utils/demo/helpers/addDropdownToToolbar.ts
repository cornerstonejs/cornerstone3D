export default function addDropDownToToolbar({
  id,
  options,
  container,
  style,
  onSelectedValueChange,
  labelText,
}: {
  id?: string;
  options: { values: number[] | string[]; defaultValue: number | string };
  container?: HTMLElement;
  style?: Record<string, any>;
  onSelectedValueChange: (value: number | string) => void;
  labelText?: string;
}) {
  const { values, defaultValue } = options;
  container = container ?? document.getElementById('demo-toolbar');

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

  values.forEach((value) => {
    const optionElement = document.createElement('option');
    optionElement.value = String(value);
    optionElement.innerText = String(value);
    if (value === defaultValue) {
      optionElement.selected = true;
    }
    select.append(optionElement);
  });

  select.onchange = (evt) => {
    const selectElement = <HTMLSelectElement>evt.target;
    if (selectElement) {
      onSelectedValueChange(selectElement.value);
    }
  };

  container.append(select);
}
