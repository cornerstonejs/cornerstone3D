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

  const toggleOnBackgroundColor = '#fcfba9';
  const toggleOffBackgroundColor = '#ffffff';

  let toggle = !!defaultToggle;

  function setBackgroundColor() {
    button.style.backgroundColor = toggle
      ? toggleOnBackgroundColor
      : toggleOffBackgroundColor;
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
}
