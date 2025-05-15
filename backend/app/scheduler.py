import os
import sys
import time
import threading
import subprocess
from datetime import datetime, timedelta

def run_scheduled_tasks():
    """Run scheduled tasks at specific times."""
    while True:
        now = datetime.utcnow()
        current_hour = now.hour
        current_minute = now.minute
        
        # Only check once per minute
        if current_minute == 0:  # Run at the top of each hour
            print(f"Scheduler checking for tasks at {now.isoformat()}")
            
            # Map of hours (UTC) to tasks
            tasks = {
                7: ("engine/pay_building_maintenance.py", "Building maintenance collection"),
                8: ("engine/treasuryRedistribution.py", "Treasury redistribution"),
                9: ("engine/distributeLeases.py", "Lease distribution"),
                10: ("engine/citizensgetjobs.py", "Citizen job assignment"),
                11: ("engine/immigration.py", "Immigration"),
                12: ("engine/househomelesscitizens.py", "Housing homeless citizens"),
                13: ("engine/decrees/affectpublicbuildingstolandowners.py", "Public buildings assignment"),
                14: ("engine/citizenhousingmobility.py", "Citizen housing mobility"),
                15: ("engine/dailyloanpayments.py", "Daily loan payments"),
                16: ("engine/citizenworkmobility.py", "Citizen work mobility"),
                17: ("engine/dailywages.py", "Daily wage payments"),
                18: ("engine/dailyrentpayments.py", "Daily rent payments"),
                19: ("ais/bidonlands.py", "AI land bidding"),
                20: ("ais/buildbuildings.py", "AI building construction"),
                21: ("ais/adjustleases.py", "AI lease adjustments"),
                22: ("ais/adjustrents.py", "AI rent adjustments"),
                23: ("ais/adjustwages.py", "AI wage adjustments"),
                0: ("ais/processnotifications.py", "AI notification processing"),
                1: ("ais/answertomessages.py", "AI message responses"),
                3: ("ais/answertomessages.py", "AI message responses"),
                5: ("ais/answertomessages.py", "AI message responses"),
                7: ("ais/answertomessages.py", "AI message responses"),
                9: ("ais/answertomessages.py", "AI message responses"),
                11: ("ais/answertomessages.py", "AI message responses"),
                13: ("ais/answertomessages.py", "AI message responses"),
                15: ("ais/answertomessages.py", "AI message responses")
            }
            
            # Check if there's a task for the current hour
            if current_hour in tasks:
                script_path, task_name = tasks[current_hour]
                print(f"Running scheduled task: {task_name}")
                
                try:
                    # Get the absolute path to the repository
                    repo_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                    script_full_path = os.path.join(repo_path, script_path)
                    
                    # Run the script
                    result = subprocess.run(
                        ["python", script_full_path],
                        capture_output=True,
                        text=True
                    )
                    
                    if result.returncode == 0:
                        print(f"Successfully ran {task_name}")
                        print(f"Output: {result.stdout[:500]}...")  # Log first 500 chars of output
                    else:
                        print(f"Error running {task_name}: {result.stderr}")
                except Exception as e:
                    print(f"Exception running {task_name}: {str(e)}")
            
            # Special case for income distribution at 4 PM UTC
            if current_hour == 16:
                print("Running income distribution")
                try:
                    # Import and run the distribute_income function directly
                    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                    from distributeIncome import distribute_income
                    distribute_income()
                    print("Successfully ran income distribution")
                except Exception as e:
                    print(f"Exception running income distribution: {str(e)}")
        
        # Sleep for 60 seconds before checking again
        time.sleep(60)

def start_scheduler():
    """Start the scheduler in a background thread."""
    scheduler_thread = threading.Thread(target=run_scheduled_tasks, daemon=True)
    scheduler_thread.start()
    print("Started scheduler thread for cron-like tasks")
