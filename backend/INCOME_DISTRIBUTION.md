# Income Distribution System

This system automatically distributes simulated income from lands to their owners on a daily basis.

## How It Works

1. Every day at 4pm UTC, the `distributeIncome.py` script runs automatically
2. The script identifies all lands with simulated income
3. For each land, it transfers the income amount from the ConsiglioDeiDieci treasury to the land owner
4. Transaction records are created to track all distributions
5. Detailed logs are kept in `income_distribution.log`

## Requirements

- Python 3.6+
- pyairtable library
- Properly configured .env file with Airtable credentials
- ConsiglioDeiDieci user must exist in the Users table with sufficient COMPUTE balance

## Manual Execution

To run the income distribution manually:

```bash
python3 distributeIncome.py
```

## Cron Job

The income distribution is scheduled to run daily at 4pm UTC via a cron job.
To modify the schedule, edit the crontab:

```bash
crontab -e
```

## Troubleshooting

If income distribution is not working:

1. Check the log files in `income_distribution.log` and `income_distribution_cron.log`
2. Verify that ConsiglioDeiDieci has sufficient COMPUTE balance
3. Ensure that lands have simulated income values in their Notes field
4. Check that all land owners exist in the Users table
