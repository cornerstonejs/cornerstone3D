export default function addDropDownToToolbar({
  id,
  options,
  container,
  onSelectedValueChange,
  labelText,
}: {
  id?: string;
  options: { values: number[] | string[]; defaultValue: number | string };
  container?: HTMLElement;
  onSelectedValueChange: (value: number | string) => void;
  labelText?: string;
}) {
  const { values, defaultValue } = options;

  // Create label element if labelText is provided
  if (labelText) {
    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerText = labelText;
    container = container ?? document.getElementById('demo-toolbar');
    container.append(label);
  }

  const select = document.createElement('select');
  select.id = id;

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

  container = container ?? document.getElementById('demo-toolbar');
  container.append(select);
}
