const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const BATCH_SIZE = 3; // Number of errors to fix in each batch
const MAX_BATCHES = 100; // Safety limit to prevent infinite loops
const TS_ERRORS_FILE = 'ts-errors.json';
const MAX_ITERATIONS = 5; // Maximum number of full iterations to run

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

// Process a single batch
async function processBatch(batch, batchNumber) {
  console.log(`\n--- Processing batch ${batchNumber}/${batches.length} (${batch.length} errors) ---`);
  
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
  return new Promise((resolve, reject) => {
    try {
      const aider = spawn('aider', aiderArgs, {
        stdio: 'inherit',
        shell: true
      });
      
      aider.on('close', code => {
        if (code === 0) {
          console.log(`Aider successfully processed batch ${batchNumber}`);
          resolve();
        } else {
          console.warn(`Aider exited with code ${code} for batch ${batchNumber}`);
          // Continue anyway
          resolve();
        }
      });
      
      aider.on('error', err => {
        console.error(`Aider process error: ${err}`);
        // Continue anyway
        resolve();
      });
    } catch (error) {
      console.error(`Failed to run Aider for batch ${batchNumber}:`, error);
      // Continue anyway
      resolve();
    }
  });
}

// Process batches in parallel, 3 at a time
async function processBatches() {
  // Process batches in groups of 3
  const PARALLEL_BATCHES = 3;
  
  // If no batches, return early
  if (batches.length === 0) {
    console.log('No batches to process.');
    return;
  }
  
  for (let batchIndex = 0; batchIndex < Math.min(batches.length, MAX_BATCHES); batchIndex += PARALLEL_BATCHES) {
    console.log(`\n--- Processing batches ${batchIndex + 1} to ${Math.min(batchIndex + PARALLEL_BATCHES, batches.length)} of ${batches.length} ---`);
    
    // Get the current group of batches to process in parallel
    const batchGroup = batches.slice(batchIndex, batchIndex + PARALLEL_BATCHES);
    
    // Create an array of promises for each batch in the group
    const batchPromises = batchGroup.map((batch, groupIndex) => {
      return processBatch(batch, batchIndex + groupIndex + 1);
    });
    
    // Wait for all batches in this group to complete
    await Promise.all(batchPromises);
    
    // Run TypeScript compiler again to check overall progress
    console.log('\nChecking overall progress after batch group...');
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
  }
  
  console.log('\nCompleted error fixing process.');
  console.log('Run `node tsc-to-json.js` to check for any remaining errors.');
}

// Main execution function
async function main() {
  let iteration = 1;
  let remainingErrors = errorData.totalErrors;
  
  while (iteration <= MAX_ITERATIONS && remainingErrors > 0) {
    console.log(`\n========== ITERATION ${iteration} OF ${MAX_ITERATIONS} ==========`);
    console.log(`Starting with ${remainingErrors} TypeScript errors to fix.`);
    
    // Process all batches
    await processBatches();
    
    // Check if we still have errors
    console.log(`\nCompleted iteration ${iteration}. Checking for remaining errors...`);
    try {
      execSync(`node tsc-to-json.js ${TS_ERRORS_FILE}`, { stdio: 'inherit' });
      
      // Read updated error count
      const updatedErrorJson = fs.readFileSync(TS_ERRORS_FILE, 'utf8');
      const updatedErrorData = JSON.parse(updatedErrorJson);
      
      remainingErrors = updatedErrorData.totalErrors;
      console.log(`Remaining errors after iteration ${iteration}: ${remainingErrors}`);
      
      // If all errors are fixed, we can exit early
      if (remainingErrors === 0) {
        console.log('All TypeScript errors have been fixed! 🎉');
        break;
      }
      
      // If we still have errors but this isn't the last iteration, prepare for next iteration
      if (iteration < MAX_ITERATIONS) {
        console.log(`Preparing for iteration ${iteration + 1}...`);
        
        // Reset batches with new errors
        batches = [];
        currentBatch = [];
        filesInCurrentBatch = new Set();
        
        // Group errors by file again
        const errorsByFile = {};
        updatedErrorData.errors.forEach(error => {
          if (!errorsByFile[error.filePath]) {
            errorsByFile[error.filePath] = [];
          }
          errorsByFile[error.filePath].push(error);
        });
        
        // Create new batches
        Object.entries(errorsByFile).forEach(([filePath, errors]) => {
          for (let i = 0; i < errors.length; i++) {
            if (currentBatch.length >= BATCH_SIZE) {
              batches.push([...currentBatch]);
              currentBatch = [];
              filesInCurrentBatch = new Set();
            }
            
            currentBatch.push(errors[i]);
            filesInCurrentBatch.add(filePath);
          }
          
          if (currentBatch.length > 0) {
            batches.push([...currentBatch]);
            currentBatch = [];
            filesInCurrentBatch = new Set();
          }
        });
        
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        
        console.log(`Created ${batches.length} new batches for iteration ${iteration + 1}.`);
      }
      
    } catch (error) {
      console.error('Error checking TypeScript errors:', error);
      break;
    }
    
    iteration++;
  }
  
  if (remainingErrors > 0) {
    console.log(`\nCompleted ${MAX_ITERATIONS} iterations but still have ${remainingErrors} errors remaining.`);
    console.log('You may need to fix the remaining errors manually or run this script again.');
  } else {
    console.log('\nAll TypeScript errors have been successfully fixed!');
  }
}

// Start the main execution
main().catch(err => {
  console.error('Error in main process:', err);
  process.exit(1);
});
