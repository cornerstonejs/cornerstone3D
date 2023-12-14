function createInfoSection(parent: HTMLElement) {
  const info = document.createElement('div');
  parent.appendChild(info);

  return {
    addInstruction(text: string) {
      const instructions = document.createElement('p');
      instructions.innerText = `- ${text}`;
      info.appendChild(instructions);
    },
  };
}

export { createInfoSection as default, createInfoSection };
