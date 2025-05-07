#!/bin/bash

# Setup cron job for income distribution
# This script sets up a cron job to run the distributeIncome.py script daily at 4pm UTC

# Make the distribution script executable
chmod +x distributeIncome.py

# Get the absolute path to the script
SCRIPT_PATH=$(realpath distributeIncome.py)
PYTHON_PATH=$(which python3)

# Create a temporary crontab file
TEMP_CRONTAB=$(mktemp)

# Export current crontab
crontab -l > "$TEMP_CRONTAB" 2>/dev/null || echo "# Income distribution cron jobs" > "$TEMP_CRONTAB"

# Check if the cron job already exists
if ! grep -q "distributeIncome.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 4pm UTC daily
    echo "0 16 * * * cd $(dirname $SCRIPT_PATH) && $PYTHON_PATH $SCRIPT_PATH >> $(dirname $SCRIPT_PATH)/income_distribution_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Income distribution will run daily at 4pm UTC."
else
    echo "Cron job already exists. No changes made."
fi

# Clean up
rm "$TEMP_CRONTAB"
