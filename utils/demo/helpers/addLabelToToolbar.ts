export function addLabelToToolbar({
  id,
  title,
  container,
  paddings,
}: {
  id?: string;
  title: string;
  container?: HTMLElement;
  paddings?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}) {
  const label = document.createElement('label');

  label.id = id;
  label.innerHTML = title;

  if (paddings) {
    label.style.paddingTop = `${paddings.top}px`;
    label.style.paddingRight = `${paddings.right}px`;
    label.style.paddingBottom = `${paddings.bottom}px`;
    label.style.paddingLeft = `${paddings.left}px`;
  }

  container = container ?? document.getElementById('demo-toolbar');
  container.append(label);

  return label;
}
