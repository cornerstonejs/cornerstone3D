export default function addSliderToToolbar(
  sliderTitle,
  { range, defaultValue },
  onSelectedValueChange,
  updateLabelOnChange
) {
  const toolbar = document.getElementById('demo-toolbar');
  const label = document.createElement('label');
  const input = document.createElement('input');

  label.htmlFor = sliderTitle;
  label.innerText = sliderTitle;

  input.type = 'range';
  input.min = range[0];
  input.max = range[1];
  input.value = defaultValue;
  input.name = sliderTitle;

  input.oninput = (evt) => {
    onSelectedValueChange(evt.target.value);
    updateLabelOnChange(evt.target.value, label);
  };
  toolbar.append(label);
  toolbar.append(input);
}
