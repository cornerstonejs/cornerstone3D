type InfoSectionOptions = {
  title?: string;
  ordered?: boolean;
};

interface InfoSection {
  /** Add an instruction item to the info section */
  addInstruction(text: string): InfoSection;
  /** Open a new nested section and move one level down */
  openNestedSection(subSectionOptions?: InfoSectionOptions): InfoSection;
  /** Close the current section and move one level up */
  closeNestedSection(): InfoSection;
}

function _createInfoSection(
  parentSection: InfoSection,
  container: HTMLElement,
  options?: InfoSectionOptions
): InfoSection {
  const orderedList = options?.ordered;
  const info = document.createElement(orderedList ? 'ol' : 'ul');
  let lastInstructionElement = null;
  const addInstruction = (text: string) => {
    const instructionElement = document.createElement('li');

    instructionElement.innerText = text;
    info.appendChild(instructionElement);
    lastInstructionElement = instructionElement;

    return instructionElement;
  };

  if (parentSection === null && options?.title) {
    const title = document.createElement('p');

    title.innerText = options.title;
    container.appendChild(title);
  }

  container.appendChild(info);

  return {
    addInstruction(text: string): InfoSection {
      addInstruction(text);
      return this;
    },
    openNestedSection(subSectionOptions?: InfoSectionOptions): InfoSection {
      if (!lastInstructionElement) {
        throw new Error('A nested section cannot be added to an empty section');
      }
      return _createInfoSection(
        this,
        lastInstructionElement,
        subSectionOptions
      );
    },
    closeNestedSection(): InfoSection {
      if (parentSection === null) {
        console.warn('This is already the top section');
        return this;
      }

      return parentSection;
    },
  };
}

/**
 * Create a new information section where instructions can be added to
 * @param container - HTML container element
 * @param options - Options
 * @returns An info section instance
 */
function createInfoSection(
  container: HTMLElement,
  options?: InfoSectionOptions
) {
  return _createInfoSection(null, container, options);
}

export { createInfoSection as default, createInfoSection };
