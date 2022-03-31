export default function addDropDownToToolbar({
  options,
  onSelectedValueChange,
}: {
  options: { values: number[] | string[]; defaultValue: number | string };
  onSelectedValueChange: (value: number) => void;
}) {
  const { values, defaultValue } = options;
  const toolbar = document.getElementById('demo-toolbar');
  const select = document.createElement('select');

  values.forEach((value) => {
    const optionElement = document.createElement('option');

    optionElement.value = String(value);
    optionElement.innerText = String(value);

    if (value === defaultValue) {
      optionElement.selected = true;
    }

    select.append(optionElement);
  });

  select.onchange = (evt) => onSelectedValueChange(evt.target.value);

  toolbar.append(select);
}
