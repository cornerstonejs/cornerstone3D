export default function addCheckboxToToolbar({
  id,
  title,
  checked,
  container,
  onChange,
}: {
  id?: string;
  title: string;
  checked?: boolean;
  container?: HTMLElement;
  onChange: (checked: boolean) => void;
}) {
  const label = document.createElement('label');
  const input = document.createElement('input');

  if (id) {
    input.id = id;
    label.id = `${id}-label`;
  }

  label.htmlFor = title;
  label.innerText = title;

  input.type = 'checkbox';
  input.checked = !!checked;
  input.name = title;

  input.addEventListener('change', (evt) => {
    const checkboxElement = <HTMLInputElement>evt.target;

    if (onChange) {
      onChange(checkboxElement.checked);
    }
  });

  container = container ?? document.getElementById('demo-toolbar');
  container.append(label);
  container.append(input);
}
