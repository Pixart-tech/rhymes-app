from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
import uuid
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Load rhymes data
with open(ROOT_DIR / 'rhymes.json', 'r') as f:
    RHYMES_DATA = json.load(f)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Models
class School(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    school_id: str
    school_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class SchoolCreate(BaseModel):
    school_id: str
    school_name: str

class RhymeSelection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    school_id: str
    grade: str
    position: str  # 'top' or 'bottom'
    rhyme_code: str
    rhyme_name: str
    pages: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class RhymeSelectionCreate(BaseModel):
    school_id: str
    grade: str
    position: str
    rhyme_code: str

class GradeStatus(BaseModel):
    grade: str
    selected_count: int
    total_available: int

# Authentication endpoints
@api_router.post("/auth/login", response_model=School)
async def login_school(input: SchoolCreate):
    # Check if school already exists
    existing_school = await db.schools.find_one({"school_id": input.school_id})
    
    if existing_school:
        return School(**existing_school)
    
    # Create new school entry
    school_dict = input.dict()
    school_obj = School(**school_dict)
    await db.schools.insert_one(school_obj.dict())
    return school_obj

# Rhymes data endpoints
@api_router.get("/rhymes")
async def get_all_rhymes():
    """Get all rhymes organized by pages"""
    rhymes_by_pages = {}
    
    for code, data in RHYMES_DATA.items():
        name, pages, personalized = data
        page_key = str(pages)
        
        if page_key not in rhymes_by_pages:
            rhymes_by_pages[page_key] = []
        
        rhymes_by_pages[page_key].append({
            "code": code,
            "name": name,
            "pages": pages,
            "personalized": personalized
        })
    
    return rhymes_by_pages

@api_router.get("/rhymes/available/{school_id}/{grade}")
async def get_available_rhymes(school_id: str, grade: str):
    """Get available rhymes for a specific grade, excluding already selected ones"""
    # Get already selected rhymes for this school and grade
    selected_rhymes = await db.rhyme_selections.find({
        "school_id": school_id,
        "grade": grade
    }).to_list(None)
    
    selected_codes = {selection["rhyme_code"] for selection in selected_rhymes}
    
    # Get available rhymes organized by pages
    rhymes_by_pages = {}
    
    for code, data in RHYMES_DATA.items():
        if code not in selected_codes:  # Only include unselected rhymes
            name, pages, personalized = data
            page_key = str(pages)
            
            if page_key not in rhymes_by_pages:
                rhymes_by_pages[page_key] = []
            
            rhymes_by_pages[page_key].append({
                "code": code,
                "name": name,
                "pages": pages,
                "personalized": personalized
            })
    
    return rhymes_by_pages

@api_router.get("/rhymes/selected/{school_id}")
async def get_selected_rhymes(school_id: str):
    """Get all selected rhymes for a school organized by grade"""
    selections = await db.rhyme_selections.find({"school_id": school_id}).to_list(None)
    
    result = {}
    for selection in selections:
        grade = selection["grade"]
        if grade not in result:
            result[grade] = {"top": None, "bottom": None}
        
        result[grade][selection["position"]] = {
            "code": selection["rhyme_code"],
            "name": selection["rhyme_name"],
            "pages": selection["pages"]
        }
    
    return result

@api_router.post("/rhymes/select", response_model=RhymeSelection)
async def select_rhyme(input: RhymeSelectionCreate):
    """Select a rhyme for a specific grade and position"""
    # Check if rhyme exists
    if input.rhyme_code not in RHYMES_DATA:
        raise HTTPException(status_code=404, detail="Rhyme not found")
    
    rhyme_data = RHYMES_DATA[input.rhyme_code]
    
    # Remove existing selection for this position if any
    await db.rhyme_selections.delete_many({
        "school_id": input.school_id,
        "grade": input.grade,
        "position": input.position
    })
    
    # Create new selection
    selection_dict = input.dict()
    selection_dict.update({
        "rhyme_name": rhyme_data[0],
        "pages": rhyme_data[1]
    })
    
    selection_obj = RhymeSelection(**selection_dict)
    await db.rhyme_selections.insert_one(selection_obj.dict())
    
    return selection_obj

@api_router.delete("/rhymes/remove/{school_id}/{grade}/{position}")
async def remove_rhyme_selection(school_id: str, grade: str, position: str):
    """Remove a rhyme selection for a specific position"""
    result = await db.rhyme_selections.delete_many({
        "school_id": school_id,
        "grade": grade,
        "position": position
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Selection not found")
    
    return {"message": "Selection removed successfully"}

@api_router.get("/rhymes/status/{school_id}")
async def get_grade_status(school_id: str):
    """Get selection status for all grades"""
    grades = ["nursery", "lkg", "ukg", "playgroup"]
    status = []
    
    for grade in grades:
        selections = await db.rhyme_selections.find({
            "school_id": school_id,
            "grade": grade
        }).to_list(None)
        
        selected_count = len(selections)
        
        status.append({
            "grade": grade,
            "selected_count": selected_count,
            "total_positions": 2  # top and bottom
        })
    
    return status

@api_router.get("/rhymes/svg/{rhyme_code}")
async def get_rhyme_svg(rhyme_code: str):
    """Get SVG content for a rhyme (mock implementation)"""
    if rhyme_code not in RHYMES_DATA:
        raise HTTPException(status_code=404, detail="Rhyme not found")
    
    rhyme_name = RHYMES_DATA[rhyme_code][0]
    
    # Mock SVG content since we can't access the network path in development
    svg_content = f'''
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#grad1)" rx="15"/>
        <text x="200" y="100" font-family="Arial, sans-serif" font-size="16" font-weight="bold" 
              text-anchor="middle" fill="white">{rhyme_name}</text>
        <text x="200" y="130" font-family="Arial, sans-serif" font-size="12" 
              text-anchor="middle" fill="white">Code: {rhyme_code}</text>
        <text x="200" y="160" font-family="Arial, sans-serif" font-size="12" 
              text-anchor="middle" fill="white">Pages: {RHYMES_DATA[rhyme_code][1]}</text>
        <circle cx="200" cy="220" r="30" fill="rgba(255,255,255,0.3)" stroke="white" stroke-width="2"/>
        <text x="200" y="225" font-family="Arial, sans-serif" font-size="20" 
              text-anchor="middle" fill="white">♪</text>
    </svg>
    '''
    
    return Response(content=svg_content, media_type="image/svg+xml")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()