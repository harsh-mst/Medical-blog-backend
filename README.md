# Medical Blog Generator API

A robust Node.js + TypeScript REST API that uses Google Gemini AI to generate professional medical blog posts from a doctor's perspective.

## Quick Start

```bash
npm install
cp .env.example .env
# Add your GOOGLE_AI_API_KEY to .env
npm run build && npm start
# Dev mode (no build):
npm run dev
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Server & AI health status |
| GET | /api/options | Valid enum values |
| POST | /api/blogs/generate | Generate a blog post |

## Example Request

```bash
curl -X POST http://localhost:3000/api/blogs/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Managing Type 2 Diabetes Through Lifestyle Changes",
    "specialization": "endocrinologist",
    "targetAudience": "patients",
    "tone": "compassionate",
    "wordCount": 700,
    "includeDisclaimer": true
  }'
```

## Robustness Features
- unhandledRejection & uncaughtException guards
- Graceful shutdown (SIGTERM/SIGINT) with 10s force-exit
- Zod input validation before hitting AI
- Central error handler — routes never crash the server
- Rate limiting (express-rate-limit)
- Helmet security headers
- 10kb payload limit
- UUID request tracing (X-Request-ID header)
- Winston structured logging to files + console
- Fail-fast startup if API key is missing

## Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| VALIDATION_ERROR | 400 | Invalid request body |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| AI_SERVICE_ERROR | 503 | Google AI failure or safety block |
| NOT_FOUND | 404 | Route does not exist |
| INTERNAL_SERVER_ERROR | 500 | Unexpected server error |

## Production (PM2)
```bash
npm run build
pm2 start dist/index.js --name medical-blog-api --max-restarts 10
```
