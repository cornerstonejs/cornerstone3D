export default function addDropDownToToolbar({ options, defaultOption }, onSelectedValueChange) {
  const toolbar = document.getElementById('demo-toolbar')
  const select = document.createElement('select')

  options.forEach((value) => {
    const optionElement = document.createElement('option')

    optionElement.value = value
    optionElement.innerText = value

    if (value === defaultOption) {
      optionElement.selected = true
    }

    select.append(optionElement)
  })

  select.onchange = (evt) => onSelectedValueChange(evt.target.value)

  toolbar.append(select)
}
