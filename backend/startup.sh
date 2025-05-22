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

# Make citizen generator and image generator executable
chmod +x engine/generate_citizen.py
chmod +x engine/generate_citizen_images.py
echo "Made generate_citizen.py and generate_citizen_images.py executable"

# Add cron job for immigration
if ! grep -q "immigration.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 11am UTC daily
    echo "0 11 * * * cd $REPO_PATH && python3 engine/immigration.py >> $REPO_PATH/immigration_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Immigration will run daily at 11am UTC."
else
    echo "Immigration cron job already exists. No changes made."
fi

# Add cron job for public buildings assignment to land owners
if ! grep -q "affectpublicbuildingstolandowners.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 1pm UTC daily
    echo "0 13 * * * cd $REPO_PATH && python3 engine/decrees/affectpublicbuildingstolandowners.py >> $REPO_PATH/public_buildings_assignment_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Public buildings assignment will run daily at 1pm UTC."
else
    echo "Public buildings assignment cron job already exists. No changes made."
fi

# Add cron job for daily loan payments
if ! grep -q "dailyloanpayments.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 3pm UTC daily
    echo "0 15 * * * cd $REPO_PATH && python3 engine/dailyloanpayments.py >> $REPO_PATH/daily_loan_payments_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Daily loan payments will run daily at 3pm UTC."
else
    echo "Daily loan payments cron job already exists. No changes made."
fi

# Add cron job for citizen housing mobility
if ! grep -q "citizenhousingmobility.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 2pm UTC daily
    echo "0 14 * * * cd $REPO_PATH && python3 engine/citizenhousingmobility.py >> $REPO_PATH/housing_mobility_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Citizen housing mobility will run daily at 2pm UTC."
else
    echo "Citizen housing mobility cron job already exists. No changes made."
fi

# Add cron job for citizen work mobility
if ! grep -q "citizenworkmobility.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 4pm UTC daily
    echo "0 16 * * * cd $REPO_PATH && python3 engine/citizenworkmobility.py >> $REPO_PATH/work_mobility_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Citizen work mobility will run daily at 4pm UTC."
else
    echo "Citizen work mobility cron job already exists. No changes made."
fi

# Add cron job for citizen job assignment
if ! grep -q "citizensgetjobs.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 10am UTC daily
    echo "0 10 * * * cd $REPO_PATH && python3 engine/citizensgetjobs.py >> $REPO_PATH/citizen_jobs_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Citizen job assignment will run daily at 10am UTC."
else
    echo "Citizen job assignment cron job already exists. No changes made."
fi

# Add cron job for daily wage payments
if ! grep -q "dailywages.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 5pm UTC daily
    echo "0 17 * * * cd $REPO_PATH && python3 engine/dailywages.py >> $REPO_PATH/daily_wages_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Daily wage payments will run daily at 5pm UTC."
else
    echo "Daily wage payments cron job already exists. No changes made."
fi

# Add cron job for daily rent payments
if ! grep -q "dailyrentpayments.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 6pm UTC daily
    echo "0 18 * * * cd $REPO_PATH && python3 engine/dailyrentpayments.py >> $REPO_PATH/daily_rent_payments_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Daily rent payments will run daily at 6pm UTC."
else
    echo "Daily rent payments cron job already exists. No changes made."
fi

# Add cron job for treasury redistribution
if ! grep -q "treasuryRedistribution.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 8am UTC daily
    echo "0 8 * * * cd $REPO_PATH && python3 engine/treasuryRedistribution.py >> $REPO_PATH/treasury_redistribution_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Treasury redistribution will run daily at 8am UTC."
else
    echo "Treasury redistribution cron job already exists. No changes made."
fi

# Add cron job for lease distribution
if ! grep -q "distributeLeases.py" "$TEMP_CRONTAB"; then
    # Add the cron job to run at 9am UTC daily
    echo "0 9 * * * cd $REPO_PATH && python3 engine/distributeLeases.py >> $REPO_PATH/lease_distribution_cron.log 2>&1" >> "$TEMP_CRONTAB"
    
    # Install the new crontab
    crontab "$TEMP_CRONTAB"
    echo "Cron job installed successfully. Lease distribution will run daily at 9am UTC."
else
    echo "Lease distribution cron job already exists. No changes made."
fi

# Clean up
rm "$TEMP_CRONTAB"

# Start the application
echo "Starting application..."
python run.py
