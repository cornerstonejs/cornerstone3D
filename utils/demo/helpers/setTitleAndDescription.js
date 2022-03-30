export default function setTitleAndDescription(titleText, descriptionText) {
  const title = document.getElementById('demo-title');
  const description = document.getElementById('demo-description');

  title.innerText = titleText;
  description.innerText = descriptionText;
}
