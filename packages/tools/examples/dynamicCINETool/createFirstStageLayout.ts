import createChildEl from './createChildEl';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';

const MAX_NUM_FRAMES = 40;

function createFirstStageLayout({
  onLoadTimePoints,
}: {
  onLoadTimePoints(numFrames: number): void;
}) {
  const container = document.createElement('div');
  const titleEl = createChildEl(container, 'div');
  const toolBarEl = createChildEl(container, 'div');
  const dropdownLabel = createChildEl(toolBarEl, 'span');
  const dropDownOptions: number[] = [];
  let numFrames = 5;

  container.id = 'firstStageContainer';
  container.style.transition = 'opacity 0.3s';

  titleEl.innerHTML = 'Stage 1: Load';
  titleEl.style.fontWeight = 'bold';

  dropdownLabel.innerHTML = 'Frames to load: ';

  for (let i = 1; i <= MAX_NUM_FRAMES; i++) {
    dropDownOptions.push(i);
  }

  addDropdownToToolbar({
    id: 'numTimePointsDropdown',
    options: {
      values: dropDownOptions,
      defaultValue: numFrames,
    },
    container: toolBarEl,
    onSelectedValueChange: (value) => {
      numFrames = value as number;
    },
  });

  addButtonToToolbar({
    id: 'btnLoadTimePoints',
    title: 'Load',
    container: toolBarEl,
    onClick: () => {
      const dropdown = document.getElementById(
        'numTimePointsDropdown'
      ) as HTMLSelectElement;
      const btnLoadTimePoints = document.getElementById(
        'btnLoadTimePoints'
      ) as HTMLButtonElement;
      const secondStageContainer = document.getElementById(
        'secondStageContainer'
      ) as HTMLDivElement;

      container.style.opacity = '0.4';
      dropdown.disabled = true;
      btnLoadTimePoints.disabled = true;
      secondStageContainer.style.opacity = '1';

      secondStageContainer.addEventListener(
        'transitionend',
        () => onLoadTimePoints(numFrames),
        { once: true }
      );
    },
  });

  return container;
}

export default createFirstStageLayout;
