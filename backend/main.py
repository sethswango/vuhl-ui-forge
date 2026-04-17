# Load environment variables first
from dotenv import load_dotenv

load_dotenv()


from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import IS_DEBUG_ENABLED
from routes import screenshot, generate_code, home, evals, sessions


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    debug_status = "ENABLED" if IS_DEBUG_ENABLED else "DISABLED"
    print(f"Backend startup complete. Debug mode is {debug_status}.")
    yield


app = FastAPI(
    openapi_url=None, docs_url=None, redoc_url=None, lifespan=lifespan
)

# Configure CORS settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add routes
app.include_router(generate_code.router)
app.include_router(screenshot.router)
app.include_router(home.router)
app.include_router(evals.router)
app.include_router(sessions.router)
