export default function addToggleButtonToToolbar({
  id,
  title,
  container,
  onClick,
  defaultToggle = false,
}: {
  id?: string;
  title: string;
  container?: HTMLElement;
  onClick: (toggle: boolean) => void;
  defaultToggle?: boolean;
}) {
  const button = document.createElement('button');

  const toggleOnBackgroundColor = '#5acce6';
  const toggleOffBackgroundColor = '#090B2B';

  let toggle = !!defaultToggle;

  function setBackgroundColor() {
    button.style.backgroundColor = toggle
      ? toggleOnBackgroundColor
      : toggleOffBackgroundColor;
    button.style.color = toggle ? '#090B2B' : '#ffffff';
  }

  setBackgroundColor();

  button.id = id;
  button.innerHTML = title;
  button.onclick = () => {
    toggle = !toggle;
    setBackgroundColor();
    onClick.call(button, toggle);
  };

  container = container ?? document.getElementById('demo-toolbar');
  container.append(button);

  return button;
}
