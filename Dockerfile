# ============================================================
# Stage 1: Build React/Vite frontend
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy React/Vite source
COPY . .

# Build production frontend
RUN npm run build


# ============================================================
# Stage 2: Python FastAPI backend
# ============================================================
FROM python:3.10-slim

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt


# Copy backend files
COPY api.py .
COPY database.py .
COPY main.py .

# Copy database if you want the existing database included
COPY billing.db .


# ============================================================
# Frontend
# ============================================================
# api.py currently expects:
# /frontend/dist
#
# Therefore copy the Vite build to that exact location.
COPY --from=frontend-builder /frontend/dist /frontend/dist


# FastAPI/Uvicorn port
EXPOSE 18432


# Start FastAPI backend
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "18432"]
