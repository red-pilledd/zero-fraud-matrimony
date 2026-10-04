import os

# Set DEV_MODE=false in your environment or docker-compose to go live.
DEV_MODE = os.getenv("DEV_MODE", "true").lower() == "true"
