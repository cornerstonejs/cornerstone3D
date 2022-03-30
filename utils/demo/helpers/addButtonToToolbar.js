export default function addButtonToToolbar(buttonTitle, onclick) {
  const toolbar = document.getElementById('demo-toolbar');
  const button = document.createElement('button');

  button.innerHTML = buttonTitle;
  button.onclick = onclick;

  toolbar.append(button);
}
