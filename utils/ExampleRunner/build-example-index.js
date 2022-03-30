const path = require('path');

module.exports = function buildExampleIndex(names, exampleBasePaths) {
  let exampleLinks = '';

  names.forEach((name, index) => {
    const examplePath = exampleBasePaths[index];

    exampleLinks += `
      <a href=${name}.html>${name}</a>\n
    `;
  });

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta http-equiv="Content-type" content="text/html; charset=utf-8"/>
      <meta name="viewport" content="width=device-width, height=device-height, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
    </head>
    <body>
      <div id="demo-title-container">
        <h1 id="demo-title">
          CornerstoneJS Examples
        </h1>
      </div>
      <div id="content">
        ${exampleLinks}
      </div>
    </body>
  </html>
  `;
};
