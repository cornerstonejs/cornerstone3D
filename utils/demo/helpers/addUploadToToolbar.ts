import createElement, { configElement } from './createElement';
import addButtonToToolbar from './addButtonToToolbar';

interface configUpload extends configElement {
  id?: string;
  title: string;
  container?: HTMLElement;
  onChange: (files: FileList) => void;
  input?: configElement;
}

export default function addUploadToToolbar(
  config: configUpload = {
    title: undefined,
    onChange: undefined,
  }
) {
  config.container =
    config.container ?? document.getElementById('demo-toolbar');

  const fnClick = () => {
    const elInput = createElement({
      tag: 'input',
      attr: {
        type: 'file',
        multiple: true,
        hidden: true,
      },
      event: {
        change: (evt: Event) => {
          const files = (evt.target as HTMLInputElement).files;

          config.onChange(files);

          elInput.remove();
        },
        cancel: () => {
          elInput.remove();
        },
      },
      ...config.input,
    });

    document.body.appendChild(elInput);

    elInput.click();
  };

  const button = addButtonToToolbar({
    ...config,
    onClick: fnClick,
  });

  return button;
}
