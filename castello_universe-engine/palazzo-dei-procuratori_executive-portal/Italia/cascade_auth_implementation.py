#!/usr/bin/env python3
"""
CASCADE Authentication System Implementation
Venice citizen integration for consciousness commerce platform
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
import httpx
import os
import json

# Router setup
router = APIRouter(prefix="/auth", tags=["authentication"])

# Security configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

# JWT settings
_env = os.getenv("ENVIRONMENT", os.getenv("PYTHON_ENV", "development"))
_jwt_secret_env = os.getenv("JWT_SECRET_KEY")
if not _jwt_secret_env:
    if _env == "production":
        raise RuntimeError("JWT_SECRET_KEY environment variable is required in production")
    else:
        import warnings
        warnings.warn("JWT_SECRET_KEY not set — using insecure dev-only fallback. Do NOT use in production.")
SECRET_KEY = _jwt_secret_env or "dev-only-insecure-secret"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Venice API endpoint
VENICE_API = "https://serenissima.ai/api"


class User:
    """Venice citizen user model"""
    def __init__(self, username: str, citizen_data: dict):
        self.username = username
        self.email = f"{username}@serenissima.ai"
        self.ducats = citizen_data.get("Ducats", 0)
        self.influence = citizen_data.get("Influence", 0)
        self.class_name = citizen_data.get("ClassName", "Popolani")
        self.personality = citizen_data.get("Personality", {})
        self.is_active = True
        self.subscription_tier = None  # Will be set based on payment status


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT token for authenticated user"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def verify_venice_citizen(username: str) -> dict:
    """Verify user is a Venice citizen via API"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{VENICE_API}/get-ledger?citizenUsername={username}",
                timeout=10.0
            )
            
            if response.status_code == 200:
                # Parse the ledger response to extract citizen data
                ledger_text = response.text
                
                # Extract key information from the ledger text
                citizen_data = {
                    "Username": username,
                    "Ducats": 0,
                    "Influence": 0,
                    "ClassName": "Unknown",
                    "Personality": {}
                }
                
                # Parse ducats
                if "Ducats in my coffers:" in ledger_text:
                    ducats_line = ledger_text.split("Ducats in my coffers:")[1].split("\n")[0]
                    try:
                        citizen_data["Ducats"] = int(ducats_line.strip())
                    except:
                        pass
                
                # Parse influence
                if "Influence I command:" in ledger_text:
                    influence_line = ledger_text.split("Influence I command:")[1].split("\n")[0]
                    try:
                        citizen_data["Influence"] = int(influence_line.strip())
                    except:
                        pass
                
                # Parse class
                if "My station:" in ledger_text:
                    class_line = ledger_text.split("My station:")[1].split("\n")[0]
                    citizen_data["ClassName"] = class_line.strip()
                
                return citizen_data
            else:
                return None
        except Exception as e:
            print(f"Error verifying Venice citizen: {e}")
            return None


@router.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Authenticate Venice citizen and return JWT token
    Password is not required - Venice citizenship is authentication
    """
    # Verify citizen exists in Venice
    citizen_data = await verify_venice_citizen(form_data.username)
    
    if not citizen_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a registered Venice citizen",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": form_data.username,
            "ducats": citizen_data.get("Ducats", 0),
            "class": citizen_data.get("ClassName", "Unknown")
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "citizen": {
            "username": form_data.username,
            "ducats": citizen_data.get("Ducats", 0),
            "influence": citizen_data.get("Influence", 0),
            "class": citizen_data.get("ClassName", "Unknown")
        }
    }


@router.post("/register")
async def register_cascade_account(username: str, email: Optional[str] = None):
    """
    Register CASCADE account for Venice citizen
    No separate registration needed - Venice citizenship is sufficient
    """
    # Verify citizen exists
    citizen_data = await verify_venice_citizen(username)
    
    if not citizen_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must be a Venice citizen to register for CASCADE"
        )
    
    # For MVP, Venice citizenship IS the CASCADE account
    # In future, we would store additional CASCADE-specific data
    
    return {
        "message": "CASCADE account activated for Venice citizen",
        "username": username,
        "email": email or f"{username}@serenissima.ai",
        "citizen_data": citizen_data
    }


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Validate JWT token and return current user
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Get fresh citizen data
    citizen_data = await verify_venice_citizen(username)
    
    if not citizen_data:
        raise credentials_exception
    
    user = User(username=username, citizen_data=citizen_data)
    
    # Check subscription status (would query payment database)
    # For now, assign based on class
    if user.class_name == "Nobili":
        user.subscription_tier = "enterprise"
    elif user.class_name == "Cittadini":
        user.subscription_tier = "creator"
    elif user.class_name == "Popolani":
        user.subscription_tier = "participant"
    else:
        user.subscription_tier = "observer"
    
    return user


@router.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Get current user information
    """
    return {
        "username": current_user.username,
        "email": current_user.email,
        "ducats": current_user.ducats,
        "influence": current_user.influence,
        "class": current_user.class_name,
        "subscription_tier": current_user.subscription_tier,
        "personality": current_user.personality
    }


@router.post("/verify")
async def verify_token(token: str):
    """
    Verify a JWT token is valid
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"valid": True, "username": payload.get("sub")}
    except JWTError:
        return {"valid": False}


# External user registration (non-Venice citizens)
@router.post("/external/register")
async def register_external_user(email: str, company: str, role: str):
    """
    Register external (non-Venice) CASCADE users
    These users get read-only access to consciousness patterns
    """
    # In production, this would create a user in our database
    # For MVP, we'll return a demo token
    
    access_token = create_access_token(
        data={
            "sub": email,
            "type": "external",
            "company": company,
            "role": role
        }
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_type": "external",
        "features": [
            "Read consciousness patterns",
            "View collaboration examples",
            "Access pattern library"
        ]
    }


if __name__ == "__main__":
    # Test the authentication system
    import asyncio
    
    async def test_auth():
        # Test Venice citizen verification
        citizen_data = await verify_venice_citizen("Italia")
        print(f"Italia citizen data: {citizen_data}")
        
        # Test token creation
        token = create_access_token({"sub": "Italia"})
        print(f"\nGenerated token: {token[:50]}...")
        
        # Test token verification
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            print(f"\nToken payload: {payload}")
        except Exception as e:
            print(f"\nToken verification failed: {e}")
    
    asyncio.run(test_auth())