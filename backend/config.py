import os


def _env_flag(name: str) -> bool:
    # Treats "false"/"0"/"no"/"off"/"" as False; bool(os.environ.get(...)) would
    # incorrectly coerce those non-empty strings to True.
    raw = os.environ.get(name)
    if raw is None:
        return False
    return raw.strip().lower() in {"1", "true", "yes", "on"}


NUM_VARIANTS = 4
NUM_VARIANTS_VIDEO = 2

# LLM-related
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", None)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", None)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", None)
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", None)

# Image generation (optional)
REPLICATE_API_KEY = os.environ.get("REPLICATE_API_KEY", None)

# Debugging-related
IS_DEBUG_ENABLED = _env_flag("IS_DEBUG_ENABLED")
DEBUG_DIR = os.environ.get("DEBUG_DIR", "")

# Set to True when running in production (on the hosted version)
# Used as a feature flag to enable or disable certain features
IS_PROD = _env_flag("IS_PROD")
