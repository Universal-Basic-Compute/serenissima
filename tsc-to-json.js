const { execSync } = require('child_process');
const fs = require('fs');

/**
 * Script to run TypeScript compiler and output errors as JSON
 * 
 * Usage: node tsc-to-json.js [output-file.json]
 * If no output file is specified, results will be printed to stdout
 */

try {
  // Run TypeScript compiler with --noEmit flag
  console.error('Running TypeScript compiler...');
  const tscOutput = execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  
  console.error('TypeScript compilation completed.');
  
  // Parse the output to extract errors
  const errors = [];
  const lines = tscOutput.split('\n');
  
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
  
} catch (error) {
  console.error('Error running TypeScript compiler:');
  console.error(error.message);
  
  // If we have stderr output from the command, show it
  if (error.stderr) {
    console.error('\nTypeScript compiler output:');
    console.error(error.stderr.toString());
  }
  
  process.exit(1);
}
