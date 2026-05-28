#!/bin/bash
# AFRIXORA Deployment Script
# This script automates the deployment process for the AFRIXORA platform
# It checks prerequisites, pulls latest code, builds containers, runs migrations, and starts services

set -e  # Exit immediately if a command exits with a non-zero status

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m" # No Color

# Print header
echo -e "${BOLD}AFRIXORA Deployment Script${NC}"
echo -e "© 2026 NAZGENIX SAS — Lubumbashi, RDC"
echo "----------------------------------------"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo -e "${YELLOW}Warning: Running as root. Consider using a non-root user with Docker permissions.${NC}"
fi

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "\n${BOLD}Checking prerequisites...${NC}"

# Check Docker
if ! command_exists docker; then
  echo -e "${RED}Error: Docker is not installed. Please install Docker first.${NC}"
  echo "Visit https://docs.docker.com/engine/install/ for installation instructions."
  exit 1
fi
echo -e "${GREEN}✓ Docker is installed${NC}"

# Check Docker Compose
if ! command_exists docker compose; then
  echo -e "${RED}Error: Docker Compose is not installed or not in PATH.${NC}"
  echo "Visit https://docs.docker.com/compose/install/ for installation instructions."
  exit 1
fi
echo -e "${GREEN}✓ Docker Compose is installed${NC}"

# Check .env file
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found.${NC}"
  echo "Please create a .env file based on .env.example"
  
  if [ -f .env.example ]; then
    echo -e "${YELLOW}Creating .env from .env.example (you MUST edit it with real values)${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️ IMPORTANT: Edit .env with real values before continuing!${NC}"
    exit 1
  else
    echo -e "${RED}Error: .env.example not found either. Cannot continue.${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}✓ .env file exists${NC}"

# Pull latest changes if in a git repository
if [ -d .git ]; then
  echo -e "\n${BOLD}Pulling latest changes...${NC}"
  git pull
  echo -e "${GREEN}✓ Code updated${NC}"
fi

# Build and start containers
echo -e "\n${BOLD}Building containers...${NC}"
docker compose build
echo -e "${GREEN}✓ Containers built${NC}"

# Create mosquitto password file if it doesn't exist
if [ ! -f infrastructure/docker/mosquitto_passwd ]; then
  echo -e "\n${BOLD}Creating Mosquitto password file...${NC}"
  
  # Extract MQTT credentials from .env
  MQTT_API_USER=$(grep MQTT_API_USER .env | cut -d '=' -f2)
  MQTT_API_PASSWORD=$(grep MQTT_API_PASSWORD .env | cut -d '=' -f2)
  
  if [ -z "$MQTT_API_USER" ] || [ -z "$MQTT_API_PASSWORD" ]; then
    echo -e "${YELLOW}Warning: MQTT credentials not found in .env${NC}"
    echo -e "${YELLOW}Creating default credentials (you should change these)${NC}"
    MQTT_API_USER="afrixora_api"
    MQTT_API_PASSWORD="changeme"
  fi
  
  # Create password file
  docker run --rm -v "$(pwd)/infrastructure/docker:/mosquitto" eclipse-mosquitto:2 \
    mosquitto_passwd -c /mosquitto/mosquitto_passwd "$MQTT_API_USER" "$MQTT_API_PASSWORD"
  
  echo -e "${GREEN}✓ Mosquitto password file created${NC}"
fi

# Run database migrations
echo -e "\n${BOLD}Running database migrations...${NC}"
docker compose up -d postgres
echo "Waiting for PostgreSQL to be ready..."
sleep 10  # Give PostgreSQL time to start

# Run migrations
docker compose run --rm api npx prisma migrate deploy
echo -e "${GREEN}✓ Database migrations applied${NC}"

# Seed database if needed
if [ "$1" == "--seed" ]; then
  echo -e "\n${BOLD}Seeding database...${NC}"
  docker compose run --rm api npx prisma db seed
  echo -e "${GREEN}✓ Database seeded${NC}"
fi

# Start all services
echo -e "\n${BOLD}Starting all services...${NC}"
docker compose up -d
echo -e "${GREEN}✓ All services started${NC}"

# Check service status
echo -e "\n${BOLD}Checking service status...${NC}"
docker compose ps

echo -e "\n${GREEN}${BOLD}AFRIXORA deployment completed successfully!${NC}"
echo -e "Access the platform at: https://${DOMAIN}"
echo -e "Grafana dashboard: https://grafana.${DOMAIN}"
echo -e "API endpoint: https://api.${DOMAIN}"
echo -e "\nTo view logs: docker compose logs -f"
echo -e "To stop all services: docker compose down"