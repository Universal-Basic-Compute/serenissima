#!/bin/bash

# Log startup
echo "Starting application setup..."

# Install required Python packages from requirements.txt
echo "Installing Python requirements..."
pip install -r requirements.txt

# Install required Node.js packages
echo "Installing required Node.js packages..."
npm install dotenv @solana/web3.js @solana/spl-token

# Make the distribution script executable
chmod +x distributeIncome.py
echo "Made distributeIncome.py executable"

# Set up the cron job
echo "Setting up cron job for income distribution..."

# Get the absolute path to the repository
REPO_PATH=$(pwd)

# Create a temporary crontab file
TEMP_CRONTAB=$(mktemp)

# Export current crontab
crontab -l > "$TEMP_CRONTAB" 2>/dev/null || echo "# Income distribution cron jobs" > "$TEMP_CRONTAB"

# Check if the cron job already exists
if ! grep -q "distributeIncome.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 12pm UTC daily (changed from 4pm)
    echo "0 16 * * * cd $REPO_PATH && python3 distributeIncome.py >> $REPO_PATH/income_distribution_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Income distribution will run daily at 12pm UTC."
else
    echo "Cron job already exists. No changes made."
fi

# Add cron job for housing homeless citizens
if ! grep -q "househomelesscitizens.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 12pm UTC daily
    echo "0 12 * * * cd $REPO_PATH && python3 engine/househomelesscitizens.py >> $REPO_PATH/house_homeless_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Housing homeless citizens will run daily at 12pm UTC."
else
    echo "Housing homeless citizens cron job already exists. No changes made."
fi

# Add cron job for immigration
if ! grep -q "immigration.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 8am UTC daily
    echo "0 8 * * * cd $REPO_PATH && python3 engine/immigration.py >> $REPO_PATH/immigration_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Immigration will run daily at 8am UTC."
else
    echo "Immigration cron job already exists. No changes made."
fi

# Clean up
rm "$TEMP_CRONTAB"

# Start the application
echo "Starting application..."
python run.py
