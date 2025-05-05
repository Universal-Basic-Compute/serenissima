const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Script to run TypeScript compiler and output errors as JSON
 * 
 * Usage: node tsc-to-json.js [output-file.json]
 * If no output file is specified, results will be printed to stdout
 */

console.error('Running TypeScript compiler...');

// Use spawn for better handling of stdout/stderr streams
const tsc = spawn('npx', ['tsc', '--noEmit'], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

tsc.stdout.on('data', (data) => {
  stdout += data.toString();
});

tsc.stderr.on('data', (data) => {
  stderr += data.toString();
});

tsc.on('close', (code) => {
  console.error(`TypeScript compiler exited with code ${code}`);
  
  if (code !== 0 && !stdout.trim()) {
    console.error('Error running TypeScript compiler:');
    
    if (stderr.trim()) {
      console.error('\nTypeScript compiler stderr output:');
      console.error(stderr);
    }
    
    // Try to provide helpful troubleshooting information
    console.error('\nTroubleshooting steps:');
    console.error('1. Check if TypeScript is installed: npm list typescript');
    console.error('2. Try installing TypeScript: npm install --save-dev typescript');
    console.error('3. Check your tsconfig.json file for errors');
    console.error('4. Try running npx tsc --version to verify the TypeScript installation');
    
    // Try to run tsc directly to see if it's a path issue
    console.error('\nAttempting to run tsc directly...');
    const directTsc = spawn('tsc', ['--noEmit'], {
      shell: true,
      stdio: 'inherit'
    });
    
    directTsc.on('close', (directCode) => {
      console.error(`Direct tsc command exited with code ${directCode}`);
      process.exit(1);
    });
    
    return;
  }
  
  console.error('TypeScript compilation completed.');
  
  // Parse the output to extract errors
  const errors = [];
  const lines = stdout.split('\n');
  
  // Regular expression to match TypeScript error format
  const errorRegex = /^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/;
  
  for (const line of lines) {
    const match = line.match(errorRegex);
    if (match) {
      const [_, filePath, lineNum, column, errorCode, message] = match;
      
      errors.push({
        filePath,
        line: parseInt(lineNum, 10),
        column: parseInt(column, 10),
        code: `TS${errorCode}`,
        message
      });
    }
  }
  
  // Create the final JSON object
  const result = {
    totalErrors: errors.length,
    timestamp: new Date().toISOString(),
    errors
  };
  
  // Output the result
  const jsonOutput = JSON.stringify(result, null, 2);
  
  // Check if an output file was specified
  const outputFile = process.argv[2];
  if (outputFile) {
    fs.writeFileSync(outputFile, jsonOutput);
    console.error(`Results written to ${outputFile}`);
  } else {
    // Print to stdout
    console.log(jsonOutput);
  }
  
  // Exit with appropriate code
  process.exit(errors.length > 0 ? 1 : 0);
});

// Add a timeout in case the process hangs
setTimeout(() => {
  console.error('TypeScript compiler timed out after 30 seconds');
  tsc.kill();
  process.exit(1);
}, 30000);
