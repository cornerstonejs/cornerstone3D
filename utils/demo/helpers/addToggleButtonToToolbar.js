export default function addToggleButtonToToolbar(toggleTitle, onclick, defaultToggle = false) {
  const toolbar = document.getElementById('demo-toolbar')
  const button = document.createElement('button')

  const toggleOnBackgroundColor = '#fcfba9'
  const toggleOffBackgroundColor = '#ffffff'

  let toggle = defaultToggle

  function setBackgroundColor() {
    button.style.backgroundColor = toggle ? toggleOnBackgroundColor : toggleOffBackgroundColor
  }

  setBackgroundColor()

  button.innerHTML = toggleTitle
  button.onclick = (evt) => {
    toggle = !toggle
    setBackgroundColor()
    onclick(evt, toggle)
  }

  toolbar.append(button)
}
