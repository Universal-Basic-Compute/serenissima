const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const BATCH_SIZE = 8; // Number of errors to fix in each batch (increased from 5 to 8)
const MAX_BATCHES = 200; // Increased from 100 to 200 to process more batches
const TS_ERRORS_FILE = 'ts-errors.json';
const MAX_ITERATIONS = 10; // Increased from 5 to 10 for more iterations

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
  
  // Create a temporary file with error details
  const tempErrorFile = `error-details-batch-${batchNumber}.txt`;
  fs.writeFileSync(tempErrorFile, errorDetails, 'utf8');
  
  // Build the Aider command with a simpler message
  const message = `Fix TypeScript errors in batch ${batchNumber}`;

  const aiderArgs = [
    '--yes-always',
    '--message', message,
  ];
  
  console.log(`Working on files: ${files.join(', ')}`);
  console.log(`Fixing errors:\n${errorDetails}`);
  
  // Create a more detailed instruction file that Aider can read
  const instructionFile = `aider-instructions-batch-${batchNumber}.md`;
  fs.writeFileSync(instructionFile, `# TypeScript Errors to Fix

Please fix the following TypeScript errors in batch ${batchNumber}:

\`\`\`
${errorDetails}
\`\`\`

Focus on adding proper type annotations and fixing type-related issues.
`, 'utf8');

  // Add the instruction file to the files to be processed
  aiderArgs.push('--file', instructionFile);
  
  // Add each file to the command
  files.forEach(file => {
    aiderArgs.push('--file', file);
  });
  
  // Log the command that will be executed
  console.log(`\nExecuting aider with batch ${batchNumber} errors\n`);
  
  // Print the error details to the console for reference
  console.log(`Error details saved to ${tempErrorFile} and instructions in ${instructionFile}`);
  
  // Run Aider
  return new Promise((resolve, reject) => {
    try {
      const aider = spawn('aider', aiderArgs, {
        stdio: 'inherit',
        shell: false
      });
      
      aider.on('close', code => {
        if (code === 0) {
          console.log(`Aider successfully processed batch ${batchNumber}`);
          // Clean up the temporary files
          try {
            fs.unlinkSync(tempErrorFile);
            fs.unlinkSync(instructionFile);
          } catch (err) {
            console.warn(`Could not delete temporary files: ${err.message}`);
          }
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

// Process batches sequentially to avoid overwhelming Aider
async function processBatches() {
  // Process batches one at a time
  const PARALLEL_BATCHES = 1;
  
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
  }
  
  console.log('\nCompleted processing all batches in this iteration.');
}

// Main execution function - simplified to just loop continuously
async function main() {
  let iteration = 1;
  const MAX_ITERATIONS = 500; // Hard limit to prevent infinite loops
  
  while (iteration <= MAX_ITERATIONS) {
    console.log(`\n========== ITERATION ${iteration} OF ${MAX_ITERATIONS} (MAX) ==========`);
    
    // Run TypeScript compiler to get current errors
    try {
      execSync(`node tsc-to-json.js ${TS_ERRORS_FILE}`, { stdio: 'inherit' });
      
      // Read updated error count
      const errorJson = fs.readFileSync(TS_ERRORS_FILE, 'utf8');
      const errorData = JSON.parse(errorJson);
      
      const remainingErrors = errorData.totalErrors;
      console.log(`Starting iteration with ${remainingErrors} TypeScript errors to fix.`);
      
      // If all errors are fixed, we can exit early
      if (remainingErrors === 0) {
        console.log('All TypeScript errors have been fixed! 🎉');
        break;
      }
      
      // Reset batches with new errors
      batches = [];
      currentBatch = [];
      filesInCurrentBatch = new Set();
      
      // Group errors by file again
      const errorsByFile = {};
      errorData.errors.forEach(error => {
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
      
      console.log(`Created ${batches.length} batches for iteration ${iteration}.`);
      
      // Process all batches
      await processBatches();
      
    } catch (error) {
      console.error('Error checking TypeScript errors:', error);
      break;
    }
    
    iteration++;
  }
  
  if (iteration > MAX_ITERATIONS) {
    console.log(`\nReached maximum number of iterations (${MAX_ITERATIONS}).`);
    console.log('You may need to fix some errors manually or run this script again.');
  } else {
    console.log('\nAll TypeScript errors have been successfully fixed or maximum iterations reached!');
  }
}

// Start the main execution
main().catch(err => {
  console.error('Error in main process:', err);
  process.exit(1);
});
