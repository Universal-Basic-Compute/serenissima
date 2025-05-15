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
                # Process imports only during dock working hours (6 AM to 6 PM Venice time)
                # Venice is UTC+1 (or UTC+2 during daylight saving time)
                # So we'll schedule for 5-17 UTC to be safe (6-18 Venice time)
                5: ("engine/processimports.py", "Process resource imports"),
                6: ("engine/processimports.py", "Process resource imports"),
                7: ("engine/processimports.py", "Process resource imports"),
                8: ("engine/processimports.py", "Process resource imports"),
                9: ("engine/processimports.py", "Process resource imports"),
                10: ("engine/processimports.py", "Process resource imports"),
                11: ("engine/processimports.py", "Process resource imports"),
                12: ("engine/processimports.py", "Process resource imports"),
                13: ("engine/processimports.py", "Process resource imports"),
                14: ("engine/processimports.py", "Process resource imports"),
                15: ("engine/processimports.py", "Process resource imports"),
                16: ("engine/processimports.py", "Process resource imports"),
                17: ("engine/processimports.py", "Process resource imports"),
                # Other tasks at specific hours
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
                20: ("ais/bidonlands.py", "AI land bidding"),
                21: ("ais/buildbuildings.py", "AI building construction"),
                22: ("ais/adjustleases.py", "AI lease adjustments"),
                23: ("ais/adjustrents.py", "AI rent adjustments"),
                0: ("ais/adjustwages.py", "AI wage adjustments"),
                1: ("ais/processnotifications.py", "AI notification processing"),
                2: ("ais/answertomessages.py", "AI message responses"),
                4: ("ais/answertomessages.py", "AI message responses"),
                6: ("ais/answertomessages.py", "AI message responses"),
                8: ("ais/answertomessages.py", "AI message responses"),
                10: ("ais/answertomessages.py", "AI message responses"),
                12: ("ais/answertomessages.py", "AI message responses"),
                14: ("ais/answertomessages.py", "AI message responses"),
                16: ("ais/answertomessages.py", "AI message responses"),
                18: ("ais/importresources.py", "AI resource import management")
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
