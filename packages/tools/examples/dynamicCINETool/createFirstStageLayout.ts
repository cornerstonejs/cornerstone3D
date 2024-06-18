import createChildEl from './createChildEl.js';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers/index.js';

const MAX_NUM_TIMEPOINTS = 40;

function createFirstStageLayout({
  onLoadTimePoints,
}: {
  onLoadTimePoints(numTimePoints): void;
}) {
  const container = document.createElement('div');
  const titleEl = createChildEl(container, 'div');
  const toolBarEl = createChildEl(container, 'div');
  const dropdownLabel = createChildEl(toolBarEl, 'span');
  const dropDownOptions = [];
  let numTimePoints = 5;

  container.id = 'firstStageContainer';
  container.style.transition = 'opacity 0.3s';

  titleEl.innerHTML = 'Stage 1: Load';
  titleEl.style.fontWeight = 'bold';

  dropdownLabel.innerHTML = 'Time points to load: ';

  for (let i = 1; i <= MAX_NUM_TIMEPOINTS; i++) {
    dropDownOptions.push(i);
  }

  addDropdownToToolbar({
    id: 'numTimePointsDropdown',
    options: {
      values: dropDownOptions,
      defaultValue: numTimePoints,
    },
    container: toolBarEl,
    onSelectedValueChange: (value) => {
      numTimePoints = <number>value;
    },
  });

  addButtonToToolbar({
    id: 'btnLoadTimePoints',
    title: 'Load',
    container: toolBarEl,
    onClick: () => {
      const dropdown = <HTMLSelectElement>(
        document.getElementById('numTimePointsDropdown')
      );
      const btnLoadTimePoints = <HTMLButtonElement>(
        document.getElementById('btnLoadTimePoints')
      );
      const secondStageContainer = <HTMLDivElement>(
        document.getElementById('secondStageContainer')
      );

      container.style.opacity = '0.4';
      dropdown.disabled = true;
      btnLoadTimePoints.disabled = true;
      secondStageContainer.style.opacity = '1';

      secondStageContainer.addEventListener(
        'transitionend',
        () => onLoadTimePoints(numTimePoints),
        { once: true }
      );
    },
  });

  return container;
}

export default createFirstStageLayout;
