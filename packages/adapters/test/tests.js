const expect = require('chai').expect;
const dcmjs = require('../build/dcmjs');

expect(dcmjs).to.be.an('Object');

const testToRun = process.argv[2];

const parts = [
  "DICOMWEB", "adapters", "data", "derivations",
  "normalizers", "sr", "utilities",
];

//
// Run a test function for each part of the package.
// Each test script should export a function called
// test.
//
parts.forEach(part => {
  expect(dcmjs).to.have.property(part);

  console.log("");
  console.log("***** Testing " + part + " *****");
  console.log("");

  const partTest = require("./test_" + part + ".js");
  partTest.test(testToRun);
});
