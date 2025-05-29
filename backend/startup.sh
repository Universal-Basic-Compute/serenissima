#!/bin/bash

# Log startup
echo "Starting application setup..."

# Assuming this script is in backend/startup.sh and executed from the project root.
# REPO_PATH will be the project root.
REPO_PATH=$(pwd)
BACKEND_DIR="$REPO_PATH/backend"
LOG_DIR="$BACKEND_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Install required Python packages from requirements.txt (assuming it's at REPO_PATH)
echo "Installing Python requirements..."
pip install -r "$REPO_PATH/requirements.txt" # Or "$BACKEND_DIR/requirements.txt" if it's there

# Install required Node.js packages (assuming package.json is at REPO_PATH)
echo "Installing required Node.js packages..."
# If npm install is slow or not strictly needed for the backend to *start*, consider moving it
# or ensure it's fast.
npm install dotenv @solana/web3.js @solana/spl-token

# Make scripts executable (Python scripts don't strictly need +x if run with `python3 ...`)
# but it doesn't hurt. Ensure paths are correct.
chmod +x "$BACKEND_DIR/distributeIncome.py"
echo "Made distributeIncome.py executable"
chmod +x "$BACKEND_DIR/engine/generate_citizen.py"
chmod +x "$BACKEND_DIR/engine/generate_citizen_images.py"
echo "Made generate_citizen.py and generate_citizen_images.py executable"


echo "Setting up cron jobs..."

TEMP_CRONTAB_CURRENT=$(mktemp)
TEMP_CRONTAB_NEW=$(mktemp)

# Export current crontab to TEMP_CRONTAB_CURRENT, or create an empty temp file
crontab -l > "$TEMP_CRONTAB_CURRENT" 2>/dev/null

# Copy current crontab to new crontab file, or start fresh if no current crontab
if [ -s "$TEMP_CRONTAB_CURRENT" ]; then
    cp "$TEMP_CRONTAB_CURRENT" "$TEMP_CRONTAB_NEW"
else
    echo "# Serenissima cron jobs" > "$TEMP_CRONTAB_NEW"
fi

# Function to add cron job if not exists in the new crontab file
add_cron_job_if_not_exists() {
    local job_identifier="$1" # Unique string to identify the job, e.g., script name
    local cron_schedule="$2"
    local script_path_relative_to_backend="$3" # e.g., engine/househomelesscitizens.py
    local log_file_name="$4"                   # e.g., house_homeless_cron.log

    local full_script_path="$BACKEND_DIR/$script_path_relative_to_backend"
    local full_log_path="$LOG_DIR/$log_file_name"
    # The `cd $REPO_PATH` is important so python can find `backend.engine...` modules if needed,
    # or if scripts use relative paths from project root.
    # Alternatively, `cd $BACKEND_DIR` and adjust python paths.
    # Using `cd $REPO_PATH` and `python3 $BACKEND_DIR/...` is explicit.
    local cron_command="$cron_schedule cd $REPO_PATH && python3 $full_script_path >> $full_log_path 2>&1"

    if ! grep -qF "$job_identifier" "$TEMP_CRONTAB_NEW"; then
        echo "$cron_command" >> "$TEMP_CRONTAB_NEW"
        echo "Cron job for '$job_identifier' will be added."
    else
        echo "Cron job for '$job_identifier' already exists in new crontab. No changes made."
    fi
}

# Define and add cron jobs
# Format: job_identifier, schedule, script_path_from_backend_dir, log_filename
add_cron_job_if_not_exists "engine/househomelesscitizens.py" "0 12 * * *" "engine/househomelesscitizens.py" "house_homeless_cron.log"
add_cron_job_if_not_exists "engine/immigration.py" "0 11 * * *" "engine/immigration.py" "immigration_cron.log"
add_cron_job_if_not_exists "engine/decrees/affectpublicbuildingstolandowners.py" "0 13 * * *" "engine/decrees/affectpublicbuildingstolandowners.py" "public_buildings_assignment_cron.log"
add_cron_job_if_not_exists "engine/dailyloanpayments.py" "0 15 * * *" "engine/dailyloanpayments.py" "daily_loan_payments_cron.log"
add_cron_job_if_not_exists "engine/citizenhousingmobility.py" "0 14 * * *" "engine/citizenhousingmobility.py" "housing_mobility_cron.log"
add_cron_job_if_not_exists "engine/citizenworkmobility.py" "0 16 * * *" "engine/citizenworkmobility.py" "work_mobility_cron.log"
add_cron_job_if_not_exists "engine/citizensgetjobs.py" "0 10 * * *" "engine/citizensgetjobs.py" "citizen_jobs_cron.log"
add_cron_job_if_not_exists "engine/dailywages.py" "0 17 * * *" "engine/dailywages.py" "daily_wages_cron.log"
add_cron_job_if_not_exists "engine/dailyrentpayments.py" "0 18 * * *" "engine/dailyrentpayments.py" "daily_rent_payments_cron.log"
add_cron_job_if_not_exists "engine/treasuryRedistribution.py" "0 8 * * *" "engine/treasuryRedistribution.py" "treasury_redistribution_cron.log"
add_cron_job_if_not_exists "engine/distributeLeases.py" "0 9 * * *" "engine/distributeLeases.py" "lease_distribution_cron.log"
# Add other cron jobs here using the same function call

# Install the new crontab from TEMP_CRONTAB_NEW
crontab "$TEMP_CRONTAB_NEW"
echo "Crontab updated with all specified jobs."

# Clean up temporary files
rm "$TEMP_CRONTAB_CURRENT"
rm "$TEMP_CRONTAB_NEW"

# Start the application
echo "Starting application (FastAPI backend)..."
# Ensure this is run from REPO_PATH so `backend.run` is correct, or `python $BACKEND_DIR/run.py`
python "$BACKEND_DIR/run.py"
