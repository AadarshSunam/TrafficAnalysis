# frontend/Dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app

ARG REACT_APP_API_URL=http://localhost:8000
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# copy package files from the frontend source folder
COPY video-analytics-frontend/package*.json ./
RUN npm ci --silent

# copy the whole frontend code and build
COPY video-analytics-frontend/ ./
RUN npm run build

# runtime stage: serve static with nginx
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
