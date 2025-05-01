const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Function to run a script and log its output
async function runScript(scriptName, description) {
  console.log(`\n=== ${description} ===\n`);
  try {
    const { stdout, stderr } = await execPromise(`npm run ${scriptName}`);
    console.log(stdout);
    if (stderr) {
      console.error(`Errors from ${scriptName}:`);
      console.error(stderr);
    }
    return true;
  } catch (error) {
    console.error(`Failed to run ${scriptName}:`);
    console.error(error.message);
    return false;
  }
}

// Main function to run all scripts in sequence
async function prepareLands() {
  console.log('Starting land preparation process...');
  
  // Step 1: Calculate centroids for all polygons
  const centroidsSuccess = await runScript('calculate-centroids', 'Calculating centroids for all polygons');
  if (!centroidsSuccess) {
    console.error('Failed to calculate centroids. Aborting process.');
    return;
  }
  
  // Step 2: Calculate areas for all polygons
  const areasSuccess = await runScript('calculate-areas', 'Calculating areas for all polygons');
  if (!areasSuccess) {
    console.error('Failed to calculate areas. Aborting process.');
    return;
  }
  
  // Step 3: Name all polygons
  const namingSuccess = await runScript('name-polygons', 'Naming all polygons');
  if (!namingSuccess) {
    console.error('Failed to name polygons. Aborting process.');
    return;
  }
  
  // Step 4: Create land records in Airtable
  const recordsSuccess = await runScript('create-land-records', 'Creating land records in Airtable');
  if (!recordsSuccess) {
    console.error('Failed to create land records. Aborting process.');
    return;
  }
  
  console.log('\n=== Land preparation complete! ===\n');
  console.log('All steps completed successfully:');
  console.log('1. Calculated centroids for all polygons');
  console.log('2. Calculated areas for all polygons');
  console.log('3. Named all polygons');
  console.log('4. Created land records in Airtable');
  console.log('\nYour lands are now ready for use in the application.');
}

// Run the main function
prepareLands().catch(error => {
  console.error('Unhandled error in prepare-lands script:');
  console.error(error);
  process.exit(1);
});
