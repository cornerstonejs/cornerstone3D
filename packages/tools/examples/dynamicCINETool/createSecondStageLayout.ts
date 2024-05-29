import createChildEl from './createChildEl.js';
import {
  addButtonToToolbar,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers/index.js';

function createSecondStageLayout({
  initialFramesPerSecond,
  onFramesPerSecondUpdated,
  onCineStart,
  onCineStop,
}: {
  initialFramesPerSecond: number;
  onFramesPerSecondUpdated(value): void;
  onCineStart(): void;
  onCineStop(): void;
}): HTMLElement {
  const container = document.createElement('div');
  const titleEl = createChildEl(container, 'div');
  const firstRowEl = createChildEl(container, 'div');
  const secondRowEl = createChildEl(container, 'div');
  const infoEl = createChildEl(secondRowEl, 'span');

  container.id = 'secondStageContainer';
  container.style.opacity = '0';
  container.style.transition = 'opacity 0.3s';

  titleEl.innerText = 'Stage 2: Interact';
  titleEl.style.fontWeight = 'bold';

  infoEl.innerText = 'Global 4D Cine ';

  addSliderToToolbar({
    id: 'fpsSlider',
    title: ` Time points per second: ${initialFramesPerSecond}`,
    range: [1, 100],
    defaultValue: initialFramesPerSecond,
    container: firstRowEl,
    onSelectedValueChange: (value) => {
      onFramesPerSecondUpdated(value);
    },
    updateLabelOnChange: (value, label) => {
      label.innerText = ` Time points per second: ${value}`;
    },
  });

  addButtonToToolbar({
    title: 'Play Clip',
    container: secondRowEl,
    onClick: () => {
      onCineStart();
    },
  });

  addButtonToToolbar({
    title: 'Stop Clip',
    container: secondRowEl,
    onClick: () => {
      onCineStop();
    },
  });

  return container;
}

export default createSecondStageLayout;
