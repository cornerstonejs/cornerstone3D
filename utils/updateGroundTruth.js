#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const groundTruthDir = path.join(__dirname, '../packages/core/test/groundTruth');

console.log('Running karma tests to collect ground truth images...');

const karmaProcess = spawn('npm', ['run', 'test:ci'], {
  cwd: path.join(__dirname, '..'),
  shell: true,
});

let outputBuffer = '';

karmaProcess.stdout.on('data', (data) => {
  const output = data.toString();
  outputBuffer += output;
  process.stdout.write(data);
});

karmaProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

karmaProcess.on('close', (code) => {
  console.log(`\nKarma tests completed with code ${code}`);
  
  // Extract ground truth updates from the output
  const regex = /\[GROUND_TRUTH_UPDATE\]::([^:]+)::([^\s]+)/g;
  let match;
  let updatedCount = 0;
  
  while ((match = regex.exec(outputBuffer)) !== null) {
    const fileName = match[1];
    const dataURL = match[2];
    
    // Extract base64 data from data URL
    const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
    
    // Construct file path
    const filePath = path.join(groundTruthDir, `${fileName}.png`);
    
    // Write the image file
    fs.writeFileSync(filePath, base64Data, 'base64');
    console.log(`Updated: ${filePath}`);
    updatedCount++;
  }
  
  console.log(`\nUpdated ${updatedCount} ground truth images`);
  
  if (code !== 0) {
    console.log('\nNote: Tests may have failed due to image comparison mismatches.');
    console.log('This is expected when updating ground truth images.');
  }
});