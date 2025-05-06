const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const BATCH_SIZE = 3; // Number of errors to fix in each batch
const MAX_BATCHES = 100; // Safety limit to prevent infinite loops
const TS_ERRORS_FILE = 'ts-errors.json';

// Run TypeScript compiler and save errors to JSON file
console.log('Running TypeScript compiler to collect errors...');
try {
  execSync(`node tsc-to-json.js ${TS_ERRORS_FILE}`, { stdio: 'inherit' });
} catch (error) {
  // Continue even if tsc exits with non-zero code (which it will if there are errors)
}

// Read the errors file
if (!fs.existsSync(TS_ERRORS_FILE)) {
  console.error(`Error file ${TS_ERRORS_FILE} not found!`);
  process.exit(1);
}

let errorData;
try {
  const errorJson = fs.readFileSync(TS_ERRORS_FILE, 'utf8');
  errorData = JSON.parse(errorJson);
} catch (error) {
  console.error(`Failed to parse ${TS_ERRORS_FILE}:`, error);
  process.exit(1);
}

// Check if there are any errors to fix
if (errorData.totalErrors === 0) {
  console.log('No TypeScript errors found! Your code is clean.');
  process.exit(0);
}

console.log(`Found ${errorData.totalErrors} TypeScript errors.`);

// Group errors by file to minimize context switching
const errorsByFile = {};
errorData.errors.forEach(error => {
  if (!errorsByFile[error.filePath]) {
    errorsByFile[error.filePath] = [];
  }
  errorsByFile[error.filePath].push(error);
});

// Create batches of errors, prioritizing fixing multiple errors in the same file
let batches = [];
let currentBatch = [];
let filesInCurrentBatch = new Set();

// First, create batches with errors from the same file
Object.entries(errorsByFile).forEach(([filePath, errors]) => {
  // Process each file's errors
  for (let i = 0; i < errors.length; i++) {
    if (currentBatch.length >= BATCH_SIZE) {
      batches.push([...currentBatch]);
      currentBatch = [];
      filesInCurrentBatch = new Set();
    }
    
    currentBatch.push(errors[i]);
    filesInCurrentBatch.add(filePath);
  }
  
  // If we have a partial batch, commit it before moving to the next file
  if (currentBatch.length > 0) {
    batches.push([...currentBatch]);
    currentBatch = [];
    filesInCurrentBatch = new Set();
  }
});

// If there's any remaining errors in the current batch
if (currentBatch.length > 0) {
  batches.push(currentBatch);
}

console.log(`Created ${batches.length} batches of errors to fix.`);

// Process batches one by one
async function processBatches() {
  for (let i = 0; i < Math.min(batches.length, MAX_BATCHES); i++) {
    const batch = batches[i];
    console.log(`\n--- Processing batch ${i + 1}/${batches.length} (${batch.length} errors) ---`);
    
    // Create a detailed error message for Aider
    const errorDetails = batch.map(error => 
      `${error.filePath}:${error.line}:${error.column} - ${error.code}: ${error.message}`
    ).join('\n');
    
    // Collect unique files for this batch
    const files = [...new Set(batch.map(error => error.filePath))];
    
    // Build the Aider command
    const aiderArgs = [
      '--yes-always',
      '--message', `Fix the following TypeScript errors:\n\n${errorDetails}`,
    ];
    
    // Add each file to the command
    files.forEach(file => {
      aiderArgs.push('--file', file);
    });
    
    console.log(`Working on files: ${files.join(', ')}`);
    console.log(`Fixing errors:\n${errorDetails}`);
    
    // Run Aider
    try {
      const aider = spawn('aider', aiderArgs, {
        stdio: 'inherit',
        shell: true
      });
      
      // Wait for Aider to complete
      await new Promise((resolve, reject) => {
        aider.on('close', code => {
          if (code === 0) {
            console.log(`Aider successfully processed batch ${i + 1}`);
            resolve();
          } else {
            console.warn(`Aider exited with code ${code} for batch ${i + 1}`);
            // Continue anyway
            resolve();
          }
        });
        
        aider.on('error', err => {
          console.error(`Aider process error: ${err}`);
          reject(err);
        });
      });
      
      // Run TypeScript compiler again to check progress
      console.log('Checking remaining errors...');
      try {
        execSync(`node tsc-to-json.js ${TS_ERRORS_FILE}`, { stdio: 'inherit' });
        
        // Read updated error count
        const updatedErrorJson = fs.readFileSync(TS_ERRORS_FILE, 'utf8');
        const updatedErrorData = JSON.parse(updatedErrorJson);
        
        console.log(`Remaining errors: ${updatedErrorData.totalErrors}`);
        
        // If all errors are fixed, we can exit early
        if (updatedErrorData.totalErrors === 0) {
          console.log('All TypeScript errors have been fixed! 🎉');
          return;
        }
      } catch (error) {
        // Continue even if there are still errors
      }
      
    } catch (error) {
      console.error(`Failed to run Aider for batch ${i + 1}:`, error);
    }
  }
  
  console.log('\nCompleted error fixing process.');
  console.log('Run `node tsc-to-json.js` to check for any remaining errors.');
}

// Start processing batches
processBatches().catch(err => {
  console.error('Error in batch processing:', err);
  process.exit(1);
});
