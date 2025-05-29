import uvicorn
import os
import datetime

if __name__ == "__main__":
    # Get port from environment variable with fallback to 10000
    port = int(os.environ.get("PORT", 10000))
    
    # Log the port we're using
    print(f"Starting server on port {port}")
    
    # Use the port from environment variable
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
