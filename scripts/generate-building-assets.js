const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Meshy API key from environment variables
const MESHY_API_KEY = process.env.MESHY_API_KEY;

if (!MESHY_API_KEY) {
  console.error('Error: MESHY_API_KEY is not set in environment variables');
  process.exit(1);
}

// Directory paths
const BUILDINGS_DIR = path.join(process.cwd(), 'data', 'buildings');
const ASSETS_DIR = path.join(process.cwd(), 'public', 'assets', 'buildings');
const PROGRESS_FILE = path.join(process.cwd(), 'data', 'building_generation_progress.json');
const ERROR_LOG = path.join(process.cwd(), 'data', 'building_generation_errors.json');

// Configuration
const CONFIG = {
  downloadFormats: {
    glb: true,  // Always download GLB (primary format for Three.js)
    fbx: false, // Skip FBX by default
    obj: false  // Skip OBJ by default
  },
  maxPromptLength: 600 // Maximum prompt length allowed by Meshy API
};

// Ensure assets directory exists
function ensureAssetsDirectoryExists() {
  const dirs = [
    ASSETS_DIR,
    path.join(ASSETS_DIR, 'models'),
    path.join(ASSETS_DIR, 'thumbnails'),
    path.join(ASSETS_DIR, 'textures')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}

// Function to save progress
function saveProgress(processedBuildings) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(processedBuildings, null, 2));
  console.log(`Progress saved: ${processedBuildings.length} buildings processed`);
}

// Function to load progress
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`Loaded progress: ${progress.length} buildings already processed`);
      return progress;
    } catch (error) {
      console.error('Error loading progress file:', error);
      return [];
    }
  }
  return [];
}

// Function to log errors
function logError(buildingName, stage, error) {
  let errors = [];
  if (fs.existsSync(ERROR_LOG)) {
    try {
      errors = JSON.parse(fs.readFileSync(ERROR_LOG, 'utf8'));
    } catch (e) {
      console.error('Error reading error log:', e);
    }
  }
  
  errors.push({
    building: buildingName,
    stage,
    error: error.message || String(error),
    timestamp: new Date().toISOString()
  });
  
  fs.writeFileSync(ERROR_LOG, JSON.stringify(errors, null, 2));
  console.error(`Error logged for ${buildingName} at ${stage} stage`);
}

// Function to truncate prompts to the maximum allowed length
function truncatePrompt(prompt, maxLength = CONFIG.maxPromptLength) {
  if (!prompt) return '';
  
  if (prompt.length <= maxLength) return prompt;
  
  // Truncate and add ellipsis to indicate truncation
  return prompt.substring(0, maxLength - 3) + '...';
}

// Utility function for retrying operations with exponential backoff
async function retryWithBackoff(operation, maxRetries = 5, initialDelay = 1000) {
  let retries = 0;
  let delay = initialDelay;
  
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      retries++;
      if (retries >= maxRetries) throw error;
      
      console.log(`Operation failed, retrying in ${delay/1000}s (attempt ${retries}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

// Get all building category files
function getBuildingCategoryFiles() {
  if (!fs.existsSync(BUILDINGS_DIR)) {
    console.error(`Buildings directory not found: ${BUILDINGS_DIR}`);
    process.exit(1);
  }
  
  return fs.readdirSync(BUILDINGS_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(BUILDINGS_DIR, file));
}

// Load buildings from all category files
async function loadAllBuildings() {
  const categoryFiles = getBuildingCategoryFiles();
  console.log(`Found ${categoryFiles.length} building category files`);
  
  let allBuildings = [];
  
  for (const file of categoryFiles) {
    try {
      const data = fs.readFileSync(file, 'utf8');
      const buildings = JSON.parse(data);
      const category = path.basename(file, '.json');
      
      // Add category to each building
      const buildingsWithCategory = buildings.map(building => ({
        ...building,
        categoryFile: category
      }));
      
      allBuildings = [...allBuildings, ...buildingsWithCategory];
      console.log(`Loaded ${buildings.length} buildings from ${category}`);
    } catch (error) {
      console.error(`Error loading buildings from ${file}:`, error);
    }
  }
  
  console.log(`Loaded ${allBuildings.length} buildings in total`);
  return allBuildings;
}

// Create a preview task for a building
async function createPreviewTask(building) {
  return retryWithBackoff(async () => {
    try {
      // Use the completedBuilding3DPrompt for the model generation
      let prompt = building.completedBuilding3DPrompt || 
                  `Renaissance Venetian ${building.name.toLowerCase()}, ${building.subCategory.toLowerCase()}, ${building.shortDescription}`;
      
      // Truncate the prompt to the maximum allowed length
      prompt = truncatePrompt(prompt, CONFIG.maxPromptLength);
      
      console.log(`Creating preview task for: ${building.name}`);
      console.log(`Using prompt: ${prompt} (${prompt.length} characters)`);
      
      const response = await axios.post('https://api.meshy.ai/openapi/v2/text-to-3d', {
        mode: 'preview',
        prompt: prompt,
        art_style: 'realistic', // Use realistic style for architectural models
        ai_model: 'meshy-4' // Use the latest model
      }, {
        headers: {
          'Authorization': `Bearer ${MESHY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && response.data.result) {
        console.log(`Preview task created for ${building.name}, task ID: ${response.data.result}`);
        return response.data.result;
      } else {
        console.error(`Failed to create preview task for ${building.name}:`, response.data);
        logError(building.name, 'preview_task_creation', { message: 'No result in response' });
        return null;
      }
    } catch (error) {
      console.error(`Error creating preview task for ${building.name}:`, error.response?.data || error.message);
      logError(building.name, 'preview_task_creation', error.response?.data || error);
      throw error; // Rethrow for retry mechanism
    }
  }, 3, 2000); // 3 retries, starting with 2 second delay
}

// Check the status of a task
async function checkTaskStatus(taskId) {
  return retryWithBackoff(async () => {
    try {
      const response = await axios.get(`https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${MESHY_API_KEY}`
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error checking task status for ${taskId}:`, error.response?.data || error.message);
      logError('unknown', 'check_task_status', { taskId, error: error.response?.data || error.message });
      throw error; // Rethrow for retry mechanism
    }
  }, 3, 2000); // 3 retries, starting with 2 second delay
}

// Create a refine task for a building
async function createRefineTask(previewTaskId, building) {
  return retryWithBackoff(async () => {
    try {
      console.log(`Creating refine task for: ${building.name} with preview task ID: ${previewTaskId}`);
      
      // Truncate texture prompt if needed
      const texturePrompt = truncatePrompt(building.shortDescription, CONFIG.maxPromptLength);
      
      const response = await axios.post('https://api.meshy.ai/openapi/v2/text-to-3d', {
        mode: 'refine',
        preview_task_id: previewTaskId,
        enable_pbr: true, // Enable PBR maps for better rendering
        texture_prompt: texturePrompt // Use the short description to guide texturing
      }, {
        headers: {
          'Authorization': `Bearer ${MESHY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && response.data.result) {
        console.log(`Refine task created for ${building.name}, task ID: ${response.data.result}`);
        return response.data.result;
      } else {
        console.error(`Failed to create refine task for ${building.name}:`, response.data);
        logError(building.name, 'refine_task_creation', { message: 'No result in response' });
        return null;
      }
    } catch (error) {
      console.error(`Error creating refine task for ${building.name}:`, error.response?.data || error.message);
      logError(building.name, 'refine_task_creation', error.response?.data || error);
      throw error; // Rethrow for retry mechanism
    }
  }, 3, 2000); // 3 retries, starting with 2 second delay
}

// Download a file from a URL
async function downloadFile(url, filePath) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error.message);
    throw error;
  }
}

// Download all assets for a building
async function downloadBuildingAssets(taskData, building) {
  try {
    const buildingId = building.name.toLowerCase().replace(/\s+/g, '-');
    const modelDir = path.join(ASSETS_DIR, 'models', buildingId);
    const textureDir = path.join(ASSETS_DIR, 'textures', buildingId);
    const thumbnailDir = path.join(ASSETS_DIR, 'thumbnails');
    
    // Create directories if they don't exist
    [modelDir, textureDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // Download model files based on configuration
    const modelPromises = [];
    for (const [format, url] of Object.entries(taskData.model_urls)) {
      if (CONFIG.downloadFormats[format]) {
        const filePath = path.join(modelDir, `model.${format}`);
        console.log(`Downloading ${format} model for ${building.name} to ${filePath}`);
        modelPromises.push(downloadFile(url, filePath));
      } else {
        console.log(`Skipping ${format} model download as per configuration`);
      }
    }
    
    // Download texture files
    const texturePromises = [];
    if (taskData.texture_urls && taskData.texture_urls.length > 0) {
      taskData.texture_urls.forEach((texture, index) => {
        if (texture.base_color) {
          const filePath = path.join(textureDir, `texture_${index}_base_color.png`);
          console.log(`Downloading base color texture ${index} for ${building.name}`);
          texturePromises.push(downloadFile(texture.base_color, filePath).catch(err => {
            console.warn(`Failed to download base color texture ${index} for ${building.name}:`, err.message);
            logError(building.name, 'texture_download', { textureIndex: index, type: 'base_color', error: err.message });
          }));
        }
        
        // Download PBR maps if available
        ['normal', 'roughness', 'metallic'].forEach(mapType => {
          if (texture[mapType]) {
            const filePath = path.join(textureDir, `texture_${index}_${mapType}.png`);
            console.log(`Downloading ${mapType} map ${index} for ${building.name}`);
            texturePromises.push(downloadFile(texture[mapType], filePath).catch(err => {
              console.warn(`Failed to download ${mapType} map ${index} for ${building.name}:`, err.message);
              logError(building.name, 'texture_download', { textureIndex: index, type: mapType, error: err.message });
            }));
          }
        });
      });
    }
    
    // Download thumbnail
    const thumbnailPromises = [];
    if (taskData.thumbnail_url) {
      const thumbnailPath = path.join(thumbnailDir, `${buildingId}.png`);
      console.log(`Downloading thumbnail for ${building.name}`);
      thumbnailPromises.push(downloadFile(taskData.thumbnail_url, thumbnailPath).catch(err => {
        console.warn(`Failed to download thumbnail for ${building.name}:`, err.message);
        logError(building.name, 'thumbnail_download', { error: err.message });
      }));
    }
    
    // Wait for all downloads to complete
    await Promise.allSettled([...modelPromises, ...texturePromises, ...thumbnailPromises]);
    
    console.log(`All assets downloaded for ${building.name}`);
    
    // Create asset paths object based on what was actually downloaded
    const assetPaths = {
      models: {},
      textures: `/assets/buildings/textures/${buildingId}/`,
      thumbnail: `/assets/buildings/thumbnails/${buildingId}.png`
    };
    
    // Only include model formats that were actually downloaded
    for (const format of Object.keys(CONFIG.downloadFormats)) {
      if (CONFIG.downloadFormats[format] && fs.existsSync(path.join(modelDir, `model.${format}`))) {
        assetPaths.models[format] = `/assets/buildings/models/${buildingId}/model.${format}`;
      }
    }
    
    // Update building data with asset paths
    return {
      ...building,
      assets: assetPaths
    };
  } catch (error) {
    console.error(`Error downloading assets for ${building.name}:`, error.message);
    logError(building.name, 'asset_download', error);
    return building;
  }
}

// Update building data in the category file
function updateBuildingData(updatedBuilding) {
  const categoryFile = path.join(BUILDINGS_DIR, `${updatedBuilding.categoryFile}.json`);
  
  try {
    const data = fs.readFileSync(categoryFile, 'utf8');
    const buildings = JSON.parse(data);
    
    // Find and update the building
    const updatedBuildings = buildings.map(building => {
      if (building.name === updatedBuilding.name) {
        // Remove the categoryFile property before saving
        const { categoryFile, ...buildingWithoutCategory } = updatedBuilding;
        return buildingWithoutCategory;
      }
      return building;
    });
    
    // Write the updated data back to the file
    fs.writeFileSync(categoryFile, JSON.stringify(updatedBuildings, null, 2));
    console.log(`Updated building data for ${updatedBuilding.name} in ${categoryFile}`);
    
    return true;
  } catch (error) {
    console.error(`Error updating building data for ${updatedBuilding.name}:`, error);
    return false;
  }
}

// Process a batch of buildings
async function processBuildingBatch(buildings) {
  for (const building of buildings) {
    try {
      console.log(`\n=== Processing building: ${building.name} ===`);
      
      // Check if assets already exist
      const buildingId = building.name.toLowerCase().replace(/\s+/g, '-');
      const glbPath = path.join(ASSETS_DIR, 'models', buildingId, 'model.glb');
      
      if (fs.existsSync(glbPath) && building.assets) {
        console.log(`Assets already exist for ${building.name}, skipping...`);
        continue;
      }
      
      // Step 1: Create preview task
      const previewTaskId = await createPreviewTask(building);
      if (!previewTaskId) {
        console.error(`Failed to create preview task for ${building.name}, skipping...`);
        logError(building.name, 'preview_task', { message: 'Failed to create preview task' });
        continue;
      }
      
      // Step 2: Wait for preview task to complete
      let previewTaskData;
      let attempts = 0;
      const maxAttempts = 30; // Maximum number of attempts (30 * 10 seconds = 5 minutes)
      
      while (attempts < maxAttempts) {
        console.log(`Checking preview task status for ${building.name} (attempt ${attempts + 1}/${maxAttempts})...`);
        previewTaskData = await checkTaskStatus(previewTaskId);
        
        if (!previewTaskData) {
          console.error(`Failed to check preview task status for ${building.name}, skipping...`);
          logError(building.name, 'preview_task_status', { taskId: previewTaskId, message: 'Failed to check status' });
          break;
        }
        
        if (previewTaskData.status === 'SUCCEEDED') {
          console.log(`Preview task for ${building.name} completed successfully!`);
          break;
        } else if (previewTaskData.status === 'FAILED') {
          console.error(`Preview task for ${building.name} failed: ${previewTaskData.task_error?.message || 'Unknown error'}`);
          logError(building.name, 'preview_task_failed', { 
            taskId: previewTaskId, 
            error: previewTaskData.task_error?.message || 'Unknown error' 
          });
          break;
        }
        
        // Wait for 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
        attempts++;
      }
      
      if (!previewTaskData || previewTaskData.status !== 'SUCCEEDED') {
        console.error(`Preview task for ${building.name} did not complete successfully, skipping...`);
        logError(building.name, 'preview_task_incomplete', { 
          taskId: previewTaskId, 
          status: previewTaskData?.status || 'unknown' 
        });
        continue;
      }
      
      // Step 3: Create refine task
      const refineTaskId = await createRefineTask(previewTaskId, building);
      if (!refineTaskId) {
        console.error(`Failed to create refine task for ${building.name}, skipping...`);
        logError(building.name, 'refine_task', { 
          previewTaskId: previewTaskId,
          message: 'Failed to create refine task' 
        });
        continue;
      }
      
      // Step 4: Wait for refine task to complete
      let refineTaskData;
      attempts = 0;
      
      while (attempts < maxAttempts) {
        console.log(`Checking refine task status for ${building.name} (attempt ${attempts + 1}/${maxAttempts})...`);
        refineTaskData = await checkTaskStatus(refineTaskId);
        
        if (!refineTaskData) {
          console.error(`Failed to check refine task status for ${building.name}, skipping...`);
          logError(building.name, 'refine_task_status', { 
            taskId: refineTaskId, 
            message: 'Failed to check status' 
          });
          break;
        }
        
        if (refineTaskData.status === 'SUCCEEDED') {
          console.log(`Refine task for ${building.name} completed successfully!`);
          break;
        } else if (refineTaskData.status === 'FAILED') {
          console.error(`Refine task for ${building.name} failed: ${refineTaskData.task_error?.message || 'Unknown error'}`);
          logError(building.name, 'refine_task_failed', { 
            taskId: refineTaskId, 
            error: refineTaskData.task_error?.message || 'Unknown error' 
          });
          break;
        }
        
        // Wait for 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
        attempts++;
      }
      
      if (!refineTaskData || refineTaskData.status !== 'SUCCEEDED') {
        console.error(`Refine task for ${building.name} did not complete successfully, skipping...`);
        logError(building.name, 'refine_task_incomplete', { 
          taskId: refineTaskId, 
          status: refineTaskData?.status || 'unknown' 
        });
        continue;
      }
      
      // Step 5: Download assets
      const updatedBuilding = await downloadBuildingAssets(refineTaskData, building);
      
      // Step 6: Update building data in the category file
      const updateResult = updateBuildingData(updatedBuilding);
      if (!updateResult) {
        logError(building.name, 'update_building_data', { message: 'Failed to update building data in category file' });
      }
      
      console.log(`\n=== Completed processing for ${building.name} ===\n`);
      
      // Add a delay between buildings to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`Error processing building ${building.name}:`, error);
      logError(building.name, 'process_building', error);
    }
  }
}

// Main function
async function main() {
  try {
    console.log('Starting building asset generation...');
    
    // Ensure assets directory exists
    ensureAssetsDirectoryExists();
    
    // Load all buildings
    const allBuildings = await loadAllBuildings();
    
    // Load progress
    const processedBuildingNames = loadProgress();
    
    // Filter buildings that don't have assets yet and weren't processed before
    const buildingsToProcess = allBuildings.filter(building => {
      const buildingId = building.name.toLowerCase().replace(/\s+/g, '-');
      const glbPath = path.join(ASSETS_DIR, 'models', buildingId, 'model.glb');
      return (!fs.existsSync(glbPath) || !building.assets) && 
             !processedBuildingNames.includes(building.name);
    });
    
    console.log(`Found ${buildingsToProcess.length} buildings that need assets`);
    
    // Process buildings in batches of 4
    const batchSize = 4;
    for (let i = 0; i < buildingsToProcess.length; i += batchSize) {
      const batch = buildingsToProcess.slice(i, i + batchSize);
      console.log(`\n=== Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(buildingsToProcess.length / batchSize)} ===\n`);
      await processBuildingBatch(batch);
      
      // Save progress after each batch
      const newProcessedBuildings = [...processedBuildingNames];
      batch.forEach(building => newProcessedBuildings.push(building.name));
      saveProgress(newProcessedBuildings);
      
      // Add a delay between batches to avoid overwhelming the API
      if (i + batchSize < buildingsToProcess.length) {
        console.log('Waiting 30 seconds before processing next batch...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
    
    console.log('\n=== Building asset generation completed ===');
    
  } catch (error) {
    console.error('Error in main function:', error);
    logError('main', 'main_function', error);
    process.exit(1);
  }
}

// Run the main function
main();
