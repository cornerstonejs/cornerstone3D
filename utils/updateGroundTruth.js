#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Get directories for both core and tools packages
const coreGroundTruthDir = path.join(__dirname, '../packages/core/test/groundTruth');
const toolsGroundTruthDir = path.join(__dirname, '../packages/tools/test/groundTruth');

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
  let coreCount = 0;
  let toolsCount = 0;
  
  while ((match = regex.exec(outputBuffer)) !== null) {
    const fileName = match[1];
    const dataURL = match[2];
    
    // Extract base64 data from data URL
    const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
    
    // Try to write to both directories - the file will exist in one or the other
    let written = false;
    
    // Check if file exists in core directory
    const coreFilePath = path.join(coreGroundTruthDir, `${fileName}.png`);
    if (fs.existsSync(coreFilePath)) {
      fs.writeFileSync(coreFilePath, base64Data, 'base64');
      console.log(`Updated (core): ${coreFilePath}`);
      coreCount++;
      written = true;
    }
    
    // Check if file exists in tools directory
    const toolsFilePath = path.join(toolsGroundTruthDir, `${fileName}.png`);
    if (fs.existsSync(toolsFilePath)) {
      fs.writeFileSync(toolsFilePath, base64Data, 'base64');
      console.log(`Updated (tools): ${toolsFilePath}`);
      toolsCount++;
      written = true;
    }
    
    // If not found in either, default to core (for new files)
    if (!written) {
      fs.writeFileSync(coreFilePath, base64Data, 'base64');
      console.log(`Updated (core-new): ${coreFilePath}`);
      coreCount++;
    }
    
    updatedCount++;
  }
  
  console.log(`\nUpdated ${updatedCount} ground truth images total`);
  console.log(`  Core package: ${coreCount} images`);
  console.log(`  Tools package: ${toolsCount} images`);
  
  if (code !== 0) {
    console.log('\nNote: Tests may have failed due to image comparison mismatches.');
    console.log('This is expected when updating ground truth images.');
  }
});