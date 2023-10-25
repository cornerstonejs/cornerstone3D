export default function addDropDownToToolbar({
  id,
  options,
  container,
  style,
  onSelectedValueChange,
}: {
  id?: string;
  options: { values: number[] | string[]; defaultValue: number | string };
  container?: HTMLElement;
  style?: Record<string, any>;
  onSelectedValueChange: (value: number | string) => void;
}) {
  const { values, defaultValue } = options;
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

  container = container ?? document.getElementById('demo-toolbar');
  container.append(select);
}
