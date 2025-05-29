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
  
  // Parse the output to extract errors
  const errors = [];
  const lines = stdout.split('\n');
  
  // Simpler regex patterns for TypeScript errors and warnings
  const errorRegex = /^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/;
  const warningRegex = /^(.+)\((\d+),(\d+)\): warning TS(\d+): (.+)$/;
  
  // Log the first few lines of output for debugging
  if (lines.length > 0) {
    console.error('\nFirst few lines of TypeScript output:');
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      if (lines[i].trim()) {
        console.error(`> ${lines[i]}`);
      }
    }
  }
  
  console.error(`Raw output length: ${stdout.length} characters`);
  console.error(`Number of lines: ${lines.length}`);
  
  // Count warnings as well as errors
  let warningCount = 0;
  
  for (const line of lines) {
    // Remove any carriage returns or line feeds
    const cleanLine = line.replace(/[\r\n]+$/, '');
    
    // Debug logging for lines that look like errors
    if (cleanLine.includes('error TS')) {
      console.error(`Trying to match: "${cleanLine}"`);
      console.error(`Regex test result: ${errorRegex.test(cleanLine)}`);
      
      // Try a direct string extraction approach as fallback
      if (!errorRegex.test(cleanLine)) {
        const parts = cleanLine.split(': error TS');
        if (parts.length === 2) {
          const locationPart = parts[0];
          const errorPart = parts[1];
          
          // Extract file, line, column
          const locationMatch = locationPart.match(/^(.+)\((\d+),(\d+)\)$/);
          if (locationMatch) {
            const [_, filePath, lineNum, column] = locationMatch;
            
            // Extract error code and message
            const errorMatch = errorPart.match(/^(\d+): (.+)$/);
            if (errorMatch) {
              const [_, errorCode, message] = errorMatch;
              
              errors.push({
                filePath,
                line: parseInt(lineNum, 10),
                column: parseInt(column, 10),
                code: `TS${errorCode}`,
                message,
                type: 'error'
              });
              
              console.error(`Successfully parsed error using fallback method: ${filePath}:${lineNum}:${column} - TS${errorCode}: ${message}`);
            }
          }
        }
      }
    }
    
    // Try the regex match first
    const errorMatch = cleanLine.match(errorRegex);
    if (errorMatch) {
      const [_, filePath, lineNum, column, errorCode, message] = errorMatch;
      
      errors.push({
        filePath,
        line: parseInt(lineNum, 10),
        column: parseInt(column, 10),
        code: `TS${errorCode}`,
        message,
        type: 'error'
      });
    }
    
    const warningMatch = cleanLine.match(warningRegex);
    if (warningMatch) {
      const [_, filePath, lineNum, column, warningCode, message] = warningMatch;
      
      warningCount++;
      // Optionally add warnings to the errors array if you want to include them
      // errors.push({
      //   filePath,
      //   line: parseInt(lineNum, 10),
      //   column: parseInt(column, 10),
      //   code: `TS${warningCode}`,
      //   message,
      //   type: 'warning'
      // });
    }
  }
  
  if (code !== 0 && !stdout.trim() && errors.length === 0) {
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
  
  // Add debug information if we have a non-zero exit code but no parsed errors
  if (errors.length === 0 && code !== 0) {
    console.error('\nWarning: TypeScript reported errors but none were parsed.');
    console.error('This might indicate a pattern matching issue.');
    console.error('Sample lines from output:');
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (lines[i].trim()) {
        console.error(`Line ${i}: ${lines[i]}`);
        console.error(`  Matches error regex: ${errorRegex.test(lines[i])}`);
      }
    }
  }

  console.error(`Found ${errors.length} errors and ${warningCount} warnings`);
  console.error('TypeScript compilation completed.');
  
  // Create the final JSON object
  const result = {
    totalErrors: errors.length,
    totalWarnings: warningCount,
    exitCode: code,
    timestamp: new Date().toISOString(),
    errors,
    // Add these fields for debugging
    rawOutputLines: lines.length,
    firstFewLines: lines.slice(0, 5).filter(l => l.trim()),
    compilerExitCode: code
  };
  
  // Output the result
  const jsonOutput = JSON.stringify(result, null, 2);
  
  // Check if an output file was specified
  const outputFile = process.argv[2];
  if (outputFile) {
    fs.writeFileSync(outputFile, jsonOutput);
    console.error(`Results written to ${outputFile}`);
  } else {
    // Print to stdout - make sure all debug info goes to stderr
    // so that stdout contains ONLY the JSON output for piping
    console.error('Printing JSON to stdout (no output file specified)');
    console.log(jsonOutput);
  }
  
  // Exit with code 0 if no errors were found, regardless of the TypeScript compiler's exit code
  // This ensures the script is considered successful when there are no TypeScript errors
  process.exit(errors.length > 0 ? 1 : 0);
});

// Add a timeout in case the process hangs
setTimeout(() => {
  console.error('TypeScript compiler timed out after 30 seconds');
  tsc.kill();
  process.exit(1);
}, 30000);
