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

        # Get the absolute path to the backend directory once
        backend_dir_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        # Task to run every 5 minutes (e.g., at :00, :05, :10, ...)
        if current_minute % 5 == 0:
            script_path_create_activities = "engine/createActivities.py"
            task_name_create_activities = "Citizen activity creation"
            script_full_path_create_activities = os.path.join(backend_dir_path, script_path_create_activities)

            print(f"Scheduler: Time for 5-minute task (createActivities) at {now.isoformat()}. Running: {task_name_create_activities} from {script_full_path_create_activities}")
            
            try:
                result_create_activities = subprocess.run(
                    ["python", script_full_path_create_activities],
                    capture_output=True,
                    text=True,
                    check=False
                )
                if result_create_activities.returncode == 0:
                    print(f"Successfully ran {task_name_create_activities}")
                    if result_create_activities.stdout:
                         print(f"Output (first 200 chars): {result_create_activities.stdout[:200].strip()}...")
                else:
                    print(f"Error running {task_name_create_activities}. Return code: {result_create_activities.returncode}")
                    if result_create_activities.stderr:
                        print(f"Error output: {result_create_activities.stderr.strip()}")
                    elif result_create_activities.stdout:
                        print(f"Output (possible error): {result_create_activities.stdout.strip()}")
            except FileNotFoundError:
                print(f"Exception running {task_name_create_activities}: Script not found at {script_full_path_create_activities}")
            except Exception as e:
                print(f"Exception running {task_name_create_activities}: {str(e)}")

        # Task to run every 5 minutes, offset from the first (e.g., at :01, :06, :11, ...)
        if (current_minute - 1) % 5 == 0: # Offset by 1 minute
            script_path_process_decay = "resources/processdecay.py"
            task_name_process_decay = "Resource decay processing"
            script_full_path_process_decay = os.path.join(backend_dir_path, script_path_process_decay)

            print(f"Scheduler: Time for 5-minute task (processdecay) at {now.isoformat()}. Running: {task_name_process_decay} from {script_full_path_process_decay}")

            try:
                result_process_decay = subprocess.run(
                    ["python", script_full_path_process_decay],
                    capture_output=True,
                    text=True,
                    check=False
                )
                if result_process_decay.returncode == 0:
                    print(f"Successfully ran {task_name_process_decay}")
                    if result_process_decay.stdout:
                        print(f"Output (first 200 chars): {result_process_decay.stdout[:200].strip()}...")
                else:
                    print(f"Error running {task_name_process_decay}. Return code: {result_process_decay.returncode}")
                    if result_process_decay.stderr:
                        print(f"Error output: {result_process_decay.stderr.strip()}")
                    elif result_process_decay.stdout:
                        print(f"Output (possible error): {result_process_decay.stdout.strip()}")
            except FileNotFoundError:
                print(f"Exception running {task_name_process_decay}: Script not found at {script_full_path_process_decay}")
            except Exception as e:
                print(f"Exception running {task_name_process_decay}: {str(e)}")
        
        # Hourly tasks (check only at the top of the hour)
        if current_minute == 0:
            print(f"Scheduler checking for hourly tasks at {now.isoformat()}")
            
            # Map of hours (UTC) to tasks
            tasks = {
                # Process imports only during dock working hours (6 AM to 6 PM Venice time)
                # Venice is UTC+1 (or UTC+2 during daylight saving time)
                # So we'll schedule for 5-17 UTC to be safe (6-18 Venice time)
                5: ("engine/createimportactivities.py", "Process resource imports"),
                6: ("engine/createimportactivities.py", "Process resource imports"),
                7: ("engine/createimportactivities.py", "Process resource imports"),
                8: ("engine/createimportactivities.py", "Process resource imports"),
                9: ("engine/createimportactivities.py", "Process resource imports"),
                10: ("engine/createimportactivities.py", "Process resource imports"),
                11: ("engine/createimportactivities.py", "Process resource imports"),
                12: ("engine/createimportactivities.py", "Process resource imports"),
                13: ("engine/createimportactivities.py", "Process resource imports"),
                14: ("engine/createimportactivities.py", "Process resource imports"),
                15: ("engine/createimportactivities.py", "Process resource imports"),
                16: ("engine/createimportactivities.py", "Process resource imports"),
                17: ("engine/createimportactivities.py", "Process resource imports"),
                # Other tasks at specific hours
                7: ("engine/pay_building_maintenance.py", "Building maintenance collection"),
                8: ("engine/treasuryRedistribution.py", "Treasury redistribution"),
                9: ("engine/distributeLeases.py", "Lease distribution"),
                10: ("engine/citizensgetjobs.py", "Citizen job assignment"),
                11: ("engine/immigration.py", "Immigration"),
                12: ("engine/househomelesscitizens.py", "Housing homeless citizens"),
                13: ("engine/decrees/affectpublicbuildingstolandowners.py", "Public buildings assignment"),
                13: ("engine/updateSocialClass.py", "Social class updates"),
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
                3: ("ais/managepublicsalesandprices.py", "AI public sell and price management"), # Updated script name and description
                4: ("ais/answertomessages.py", "AI message responses"),
                6: ("ais/answertomessages.py", "AI message responses"),
                8: ("ais/answertomessages.py", "AI message responses"),
                10: ("ais/answertomessages.py", "AI message responses"),
                12: ("ais/answertomessages.py", "AI message responses"),
                14: ("ais/answertomessages.py", "AI message responses"),
                16: ("ais/answertomessages.py", "AI message responses"),
                18: ("ais/adjustimports.py", "AI resource import management"),
                20: ("ais/delegateBusinesses.py", "AI Business Delegation") # Example time, adjust as needed
            }
            
            # Check if there's a task for the current hour
            if current_hour in tasks:
                # Ensure tasks[current_hour] is not a string before trying to unpack
                task_entry = tasks[current_hour]
                if isinstance(task_entry, tuple) and len(task_entry) == 2:
                    script_path, task_name = task_entry
                    print(f"Scheduler: Running scheduled task: {task_name}")
                
                    try:
                        # backend_dir_path is already defined above
                        script_full_path = os.path.join(backend_dir_path, script_path)
                        
                        # Run the script
                        result = subprocess.run(
                            ["python", script_full_path],
                            capture_output=True,
                            text=True,
                            check=False # Avoid raising CalledProcessError, check returncode manually
                        )
                        
                        if result.returncode == 0:
                            print(f"Successfully ran {task_name}")
                            if result.stdout:
                                print(f"Output: {result.stdout[:500].strip()}...")
                        else:
                            print(f"Error running {task_name}. Return code: {result.returncode}")
                            if result.stderr:
                                print(f"Error output: {result.stderr.strip()}")
                            elif result.stdout: # Some scripts might output errors to stdout
                                 print(f"Output (possible error): {result.stdout.strip()}")
                    except FileNotFoundError:
                        print(f"Exception running {task_name}: Script not found at {script_full_path}")
                    except Exception as e:
                        print(f"Exception running {task_name}: {str(e)}")
                else:
                    # Handle cases where a single hour might have multiple tasks defined differently
                    # This part of the original code structure for tasks might need review if an hour can have multiple script paths.
                    # For now, assuming one script per hour entry or it's handled by how tasks dict is structured.
                    # If tasks[current_hour] could be a list of tuples, iterate here.
                    # Example: if isinstance(task_entry, list): for script_path, task_name in task_entry: ...
                    log_message_multiple_tasks = f"Task entry for hour {current_hour} is not a (script_path, task_name) tuple: {task_entry}. Skipping."
                    print(log_message_multiple_tasks) # Or log.warning if logger is configured
            
            # Special case for income distribution at 4 PM UTC
            # This task is also at the top of the hour (current_minute == 0)
            # if current_hour == 16: # This was the old income distribution
            #     print("Scheduler: Running income distribution")
            #     try:
            #         # Ensure the backend directory is in sys.path for the import
            #         backend_dir_path_for_import = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            #         if backend_dir_path_for_import not in sys.path:
            #             sys.path.append(backend_dir_path_for_import)
                    
            #         from distributeIncome import distribute_income # Assuming distributeIncome.py is in backend/
            #         distribute_income()
            #         print("Scheduler: Successfully ran income distribution")
            #     except ImportError:
            #         print(f"Exception running income distribution: Could not import distribute_income. Ensure distributeIncome.py is in the backend directory and backend directory is in PYTHONPATH.")
            #     except Exception as e:
            #         print(f"Exception running income distribution: {str(e)}")
        
        # Sleep for 60 seconds before checking again
        # The loop runs once per minute. Conditions for 5-min and hourly tasks are checked each time.
        time.sleep(60)

def start_scheduler():
    """Start the scheduler in a background thread."""
    scheduler_thread = threading.Thread(target=run_scheduled_tasks, daemon=True)
    scheduler_thread.start()
    print("Started scheduler thread for cron-like tasks")
