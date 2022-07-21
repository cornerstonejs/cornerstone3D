function createMetadataRow(text, metadata) {
  const row = document.createElement('div');

  const label = document.createElement('span');
  label.innerHTML = `${text}: `;

  const value = document.createElement('span');

  value.id = text.replace(/\s/g, '').toLowerCase();

  row.appendChild(label);
  row.appendChild(value);

  metadata.appendChild(row);
}

function setup(document) {
  const content = document.getElementById('content');

  // Form
  const form = document.createElement('form');
  form.style.marginBottom = '20px';
  const formInput = document.createElement('input');
  formInput.id = 'selectFile';
  formInput.type = 'file';
  form.appendChild(formInput);

  // image div
  const element = document.createElement('div');
  element.oncontextmenu = (e) => e.preventDefault();
  element.id = 'cornerstone-element';
  element.style.width = '500px';
  element.style.height = '500px';

  const div = document.createElement('div');
  div.style.display = 'flex';
  div.style.flexDirection = 'row';

  const metadata = document.createElement('div');
  metadata.style.marginLeft = '20px';

  div.appendChild(element);
  div.appendChild(metadata);

  createMetadataRow('Transfer Syntax', metadata);
  createMetadataRow('SOPClassUID', metadata);
  createMetadataRow('SOPInstanceUID', metadata);
  createMetadataRow('Rows', metadata);
  createMetadataRow('Columns', metadata);
  createMetadataRow('Spacing', metadata);
  createMetadataRow('Direction', metadata);
  createMetadataRow('Origin', metadata);
  createMetadataRow('Modality', metadata);
  createMetadataRow('Pixel Representation', metadata);
  createMetadataRow('Bits Allocated', metadata);
  createMetadataRow('Bits Stored', metadata);
  createMetadataRow('High Bit', metadata);
  createMetadataRow('Photometric Interpretation', metadata);
  createMetadataRow('Window Width', metadata);
  createMetadataRow('Window Center', metadata);

  content.appendChild(form);
  content.appendChild(div);

  return { element };
}

export default setup;
