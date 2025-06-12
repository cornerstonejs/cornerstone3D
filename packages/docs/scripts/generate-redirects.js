const fs = require('fs');
const path = require('path');

// Build path where the _redirects file should be placed
const buildDir = path.resolve(__dirname, '../build');
const redirectsPath = path.join(buildDir, '_redirects');

// Redirect rules
const redirectsContent = `# Netlify redirects
# SPA rules for our docs
/coverage    /coverage/index.html    200
/coverage/*  /coverage/:splat  200
/*    /index.html   200
`;

// Ensure the build directory exists
if (!fs.existsSync(buildDir)) {
  console.error('Build directory does not exist. Make sure the Docusaurus build has completed.');
  process.exit(1);
}

// Write the _redirects file
fs.writeFileSync(redirectsPath, redirectsContent);

console.log('_redirects file generated successfully in', redirectsPath);