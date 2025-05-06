const fs = require('fs').promises;
const path = require('path');

async function organizeBuildingsByCategory() {
  try {
    console.log('Starting building organization...');
    
    // Source directory containing building JSON files
    const sourceDir = path.join(__dirname, 'data', 'buildings');
    
    // Output directory where categorized buildings will be stored
    const outputDir = path.join(__dirname, 'data', 'buildings-organized');
    
    // Create the output directory if it doesn't exist
    try {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`Created output directory: ${outputDir}`);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
    
    // Get all JSON files in the source directory
    const files = await fs.readdir(sourceDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    console.log(`Found ${jsonFiles.length} JSON files to process`);
    
    // Track all buildings for statistics
    let totalBuildingsProcessed = 0;
    const categoryStats = {};
    const subcategoryStats = {};
    
    // Process each JSON file
    for (const file of jsonFiles) {
      console.log(`Processing file: ${file}`);
      
      // Read and parse the JSON file
      const filePath = path.join(sourceDir, file);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const buildings = JSON.parse(fileContent);
      
      // Process each building in the file
      for (const building of buildings) {
        totalBuildingsProcessed++;
        
        // Get the category and subcategory
        const category = building.category;
        const subcategory = building.subcategory || 'Uncategorized';
        
        // Create sanitized folder names
        const sanitizedCategory = category.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const sanitizedSubcategory = subcategory.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        
        // Update statistics
        if (!categoryStats[category]) {
          categoryStats[category] = 0;
        }
        categoryStats[category]++;
        
        const subcategoryKey = `${category} - ${subcategory}`;
        if (!subcategoryStats[subcategoryKey]) {
          subcategoryStats[subcategoryKey] = 0;
        }
        subcategoryStats[subcategoryKey]++;
        
        // Create category folder if it doesn't exist
        const categoryDir = path.join(outputDir, sanitizedCategory);
        try {
          await fs.mkdir(categoryDir, { recursive: true });
        } catch (err) {
          if (err.code !== 'EEXIST') {
            throw err;
          }
        }
        
        // Create subcategory folder if it doesn't exist
        const subcategoryDir = path.join(categoryDir, sanitizedSubcategory);
        try {
          await fs.mkdir(subcategoryDir, { recursive: true });
        } catch (err) {
          if (err.code !== 'EEXIST') {
            throw err;
          }
        }
        
        // Create a sanitized filename for the building
        const sanitizedBuildingName = building.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const buildingFilePath = path.join(subcategoryDir, `${sanitizedBuildingName}.json`);
        
        // Write the building to its own file
        await fs.writeFile(buildingFilePath, JSON.stringify(building, null, 2), 'utf8');
        console.log(`  - Saved building: ${building.name} to ${buildingFilePath}`);
      }
    }
    
    // Create an index file with statistics
    const stats = {
      totalBuildings: totalBuildingsProcessed,
      categoryCounts: categoryStats,
      subcategoryCounts: subcategoryStats,
      processedAt: new Date().toISOString()
    };
    
    await fs.writeFile(
      path.join(outputDir, 'index.json'), 
      JSON.stringify(stats, null, 2), 
      'utf8'
    );
    
    // Create a README file with information about the organization
    const readme = `# Building Organization

This directory contains buildings organized by category and subcategory.

## Statistics
- Total buildings: ${totalBuildingsProcessed}
- Processed at: ${new Date().toISOString()}

## Categories
${Object.entries(categoryStats).map(([category, count]) => `- ${category}: ${count} buildings`).join('\n')}

## Subcategories
${Object.entries(subcategoryStats).map(([subcategory, count]) => `- ${subcategory}: ${count} buildings`).join('\n')}

## Structure
Each building is stored in its own JSON file within a folder structure:
\`\`\`
/category/subcategory/building_name.json
\`\`\`
`;
    
    await fs.writeFile(
      path.join(outputDir, 'README.md'), 
      readme, 
      'utf8'
    );
    
    console.log('\nBuilding organization complete!');
    console.log(`Total buildings processed: ${totalBuildingsProcessed}`);
    console.log('Category statistics:');
    
    for (const [category, count] of Object.entries(categoryStats)) {
      console.log(`  - ${category}: ${count} buildings`);
    }
    
    console.log('\nSubcategory statistics:');
    for (const [subcategory, count] of Object.entries(subcategoryStats)) {
      console.log(`  - ${subcategory}: ${count} buildings`);
    }
    
  } catch (error) {
    console.error('Error organizing buildings:', error);
  }
}

// Run the function
organizeBuildingsByCategory();
