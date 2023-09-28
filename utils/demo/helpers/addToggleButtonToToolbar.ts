export default function addToggleButtonToToolbar({
  id,
  title,
  onClick,
  defaultToggle = false,
}: {
  id?: string;
  title: string;
  onClick: (toggle: boolean) => void;
  defaultToggle?: boolean;
}) {
  const toolbar = document.getElementById('demo-toolbar');
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
    onClick(toggle);
  };

  toolbar.append(button);
}
