export default function addRadioGroupToToolbar({
  name,
  options,
  container,
  onChange,
}: {
  name: string;
  options: {
    values: string[];
    defaultValue: string;
  };
  container?: HTMLElement;
  onChange: (value: string) => void;
}) {
  container = container ?? document.getElementById('demo-toolbar');

  // Only a single element with all buttons have to be appended to the container
  // element otherwise it breaks the grid layout adding one element per grid cell
  const radioGroupElement = document.createElement('div');

  const { values, defaultValue } = options;

  values.forEach((value) => {
    const radioItemElement = document.createElement('span');
    const input = document.createElement('input');
    const label = document.createElement('label') as HTMLLabelElement;
    const id = `${name}_${value}`;

    input.type = 'radio';
    input.id = id;
    input.name = name;
    input.value = value;
    input.checked = value === defaultValue;

    label.htmlFor = id;
    label.innerText = value;

    radioItemElement.appendChild(input);
    radioItemElement.appendChild(label);
    radioGroupElement.appendChild(radioItemElement);
  });

  container.appendChild(radioGroupElement);

  radioGroupElement.addEventListener('change', (evt) => {
    const radioButton = <HTMLInputElement>evt.target;

    if (onChange) {
      onChange(radioButton.value);
    }
  });
}
