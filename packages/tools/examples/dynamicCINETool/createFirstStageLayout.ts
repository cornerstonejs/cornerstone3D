import createChildEl from './createChildEl';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';

const MAX_NUM_DIMENSION_GROUPS = 40;

function createFirstStageLayout({
  onLoadDimensionGroups,
}: {
  onLoadDimensionGroups(numDimensionGroups: number): void;
}) {
  const container = document.createElement('div');
  const titleEl = createChildEl(container, 'div');
  const toolBarEl = createChildEl(container, 'div');
  const dropdownLabel = createChildEl(toolBarEl, 'span');
  const dropDownOptions: number[] = [];
  let numDimensionGroups = 5;

  container.id = 'firstStageContainer';
  container.style.transition = 'opacity 0.3s';

  titleEl.innerHTML = 'Stage 1: Load';
  titleEl.style.fontWeight = 'bold';

  dropdownLabel.innerHTML = 'Dimension groups to load: ';

  for (let i = 1; i <= MAX_NUM_DIMENSION_GROUPS; i++) {
    dropDownOptions.push(i);
  }

  addDropdownToToolbar({
    id: 'numDimensionGroupsDropdown',
    options: {
      values: dropDownOptions,
      defaultValue: numDimensionGroups,
    },
    container: toolBarEl,
    onSelectedValueChange: (value) => {
      numDimensionGroups = value as number;
    },
  });

  addButtonToToolbar({
    id: 'btnLoadDimensionGroups',
    title: 'Load',
    container: toolBarEl,
    onClick: () => {
      const dropdown = document.getElementById(
        'numDimensionGroupsDropdown'
      ) as HTMLSelectElement;
      const btnLoadDimensionGroups = document.getElementById(
        'btnLoadDimensionGroups'
      ) as HTMLButtonElement;
      const secondStageContainer = document.getElementById(
        'secondStageContainer'
      ) as HTMLDivElement;

      container.style.opacity = '0.4';
      dropdown.disabled = true;
      btnLoadDimensionGroups.disabled = true;
      secondStageContainer.style.opacity = '1';

      secondStageContainer.addEventListener(
        'transitionend',
        () => onLoadDimensionGroups(numDimensionGroups),
        { once: true }
      );
    },
  });

  return container;
}

export default createFirstStageLayout;
