export default function addButtonToToolbar({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  const toolbar = document.getElementById('demo-toolbar');
  const button = document.createElement('button');

  button.innerHTML = title;
  button.onclick = onClick;

  toolbar.append(button);
}
