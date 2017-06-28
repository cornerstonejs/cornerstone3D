let converterSpecDOM;
let converterSpecMappings = {};

let converterSpecRequest = new XMLHttpRequest();
converterSpecRequest.open('GET', '../data/QIICR_LegacyConvertedEnhancedMRImageIOD.xml');

converterSpecRequest.onreadystatechange = function() {
  if (converterSpecRequest.readyState !== 4) {
    console.log(`Request is now in state ${converterSpecRequest.readyState}`);
    return;
  }
  let xmlString = converterSpecRequest.responseText;
  let parser = new DOMParser();
  converterSpecDOM = parser.parseFromString(xmlString, "application/xml");
  converterSpecDOM.querySelectorAll('table').forEach(table => {
    try {
      let caption = table.getElementsByTagName('caption')[0].textContent;
      let ths = table.querySelectorAll('thead th');
      if (ths.length < 5) {
        return;
      }
      let header0 = ths[0].getElementsByTagName('para')[0].textContent;
      let header4 = ths[4].getElementsByTagName('para')[0].textContent;
      if (header0 === "Attribute Name" && header4 === "QIICR Usage") {
        let tbody = table.getElementsByTagName('tbody')[0];
        table.querySelectorAll('tbody tr').forEach(tr => {
          let tds = tr.getElementsByTagName('td');
          if (tds.length !== ths.length) {
            return;
          }
          let attribute = tds[0].getElementsByTagName('para')[0].textContent;
          let usageParas = tds[4].getElementsByTagName('para');
          if (usageParas[0]) { // work around table C.7.6.16-12
            let usage = usageParas[0].textContent;
            if (!converterSpecMappings[attribute]) {
              converterSpecMappings[attribute] = [];
            }
            converterSpecMappings[attribute].push([caption, usage]);
          }
        });
      }
    }
    catch (e) {
      console.log('Not a mapping table');
      console.log(table);
      console.log(e);
    }
  });
  console.log(converterSpecMappings);
};

converterSpecRequest.send();