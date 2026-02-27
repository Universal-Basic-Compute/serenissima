"""
Redis Launcher - Automatically starts Redis server if not running
"""

import subprocess
import socket
import time
import logging
import os
import atexit

logger = logging.getLogger(__name__)

class RedisLauncher:
    """Manages Redis server lifecycle"""
    
    def __init__(self, port=6379, config_path=None):
        self.port = port
        self.config_path = config_path
        self.redis_process = None
        
    def is_redis_running(self) -> bool:
        """Check if Redis is already running on the specified port"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('localhost', self.port))
            sock.close()
            return result == 0
        except Exception:
            return False
            
    def start_redis(self) -> bool:
        """Start Redis server if not already running"""
        if self.is_redis_running():
            logger.info(f"Redis already running on port {self.port}")
            return True
            
        try:
            # Try to start Redis server
            logger.info(f"Starting Redis server on port {self.port}...")
            
            # Build command
            cmd = ['redis-server']
            if self.config_path and os.path.exists(self.config_path):
                cmd.append(self.config_path)
            else:
                # Use default config with our port
                cmd.extend(['--port', str(self.port), '--save', '""'])
            
            # Start Redis in background
            self.redis_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Register cleanup on exit
            atexit.register(self.stop_redis)
            
            # Wait for Redis to start
            for i in range(10):
                time.sleep(0.5)
                if self.is_redis_running():
                    logger.info(f"✅ Redis server started successfully on port {self.port}")
                    return True
                    
            # Check if process failed
            if self.redis_process.poll() is not None:
                stdout, stderr = self.redis_process.communicate()
                logger.error(f"Redis failed to start: {stderr}")
                return False
                
        except FileNotFoundError:
            logger.error("Redis server not found. Please install Redis: sudo apt-get install redis-server")
            return False
        except Exception as e:
            logger.error(f"Failed to start Redis: {e}")
            return False
            
        return False
        
    def stop_redis(self):
        """Stop the Redis server if we started it"""
        if self.redis_process and self.redis_process.poll() is None:
            logger.info("Stopping Redis server...")
            self.redis_process.terminate()
            try:
                self.redis_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.redis_process.kill()
            logger.info("Redis server stopped")

# Global instance
redis_launcher = RedisLauncher()

def ensure_redis_running(port=6379) -> bool:
    """Convenience function to ensure Redis is running"""
    return redis_launcher.start_redis()