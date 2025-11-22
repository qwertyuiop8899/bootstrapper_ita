# Use Node.js LTS
FROM node:20-alpine as builder

# Set working directory
WORKDIR /app

# Install git
RUN apk add --no-cache git

# Clone the repository
RUN git clone https://github.com/qwertyuiop8899/bootstrapper_ita .

# Install dependencies
RUN npm install

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install serve to serve static files
RUN npm install -g serve

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Expose port 7860 (Hugging Face Spaces default)
EXPOSE 7860

# Start the server
CMD ["serve", "-s", "dist", "-l", "7860"]
