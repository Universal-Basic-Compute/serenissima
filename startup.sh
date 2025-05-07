#!/bin/bash

# Log startup
echo "Starting application setup..."

# Make the distribution script executable
chmod +x backend/distributeIncome.py
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
    # Add the cron job to run at 4pm UTC daily
    echo "0 16 * * * cd $REPO_PATH/backend && python3 distributeIncome.py >> $REPO_PATH/backend/income_distribution_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Income distribution will run daily at 4pm UTC."
else
    echo "Cron job already exists. No changes made."
fi

# Clean up
rm "$TEMP_CRONTAB"

# Start the application
echo "Starting application..."
cd backend && python run.py
