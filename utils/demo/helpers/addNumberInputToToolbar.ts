export default function addButtonToToolbar({
  id,
  value,
  min,
  max,
  step = 1,
  style,
  container,
  onChange,
}: {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  style?: Record<string, any>;
  container?: HTMLElement;
  onChange?: (value: number) => void;
}) {
  const input = document.createElement('input');

  input.id = id;
  input.type = 'number';
  input.value = value.toString();
  input.min = min?.toString();
  input.max = max?.toString();
  input.step = step.toString();

  if (style) {
    Object.assign(input.style, style);
  }

  input.onchange = (evt) => {
    const input = <HTMLInputElement>evt.target;

    if (input) {
      onChange?.(input.valueAsNumber);
    }
  };

  container = container ?? document.getElementById('demo-toolbar');
  container.append(input);
}
