const fs = require('fs');
const path = require('path');

// Function to remove ANSI color codes
function stripAnsiCodes(str) {
  return str.replace(/\x1B\[[0-9;]*[mGK]/g, '');
}

// Function to extract base64 image data from a log line
function extractBase64Image(line) {
  const cleanLine = stripAnsiCodes(line);
  const match = cleanLine.match(
    /([^:]+):\s*(data:image\/png;base64,[A-Za-z0-9+/=]+)/
  );
  if (match) {
    return {
      name: match[1].trim().replace(/'/g, ''), // Remove single quotes
      data: match[2].split(',')[1],
    };
  }
  return null;
}

// Function to save base64 image data as PNG file
function saveAsPNG(name, base64Data) {
  const buffer = Buffer.from(base64Data, 'base64');
  const filename = `${name}.png`;
  fs.writeFileSync(filename, buffer);
  console.debug(`Saved ${filename}`);
}

// Main function to process the log file
function processLogFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let savedCount = 0;

  lines.forEach((line) => {
    if (line.includes('data:image/png;base64,')) {
      const imageData = extractBase64Image(line);
      if (imageData) {
        saveAsPNG(imageData.name, imageData.data);
        savedCount++;
      }
    }
  });

  console.debug(`Total images saved: ${savedCount}`);
}

// Check if a file path is provided as a command-line argument
if (process.argv.length < 3) {
  console.debug('Please provide the path to the log file as an argument.');
  process.exit(1);
}

const logFilePath = process.argv[2];
processLogFile(logFilePath);
