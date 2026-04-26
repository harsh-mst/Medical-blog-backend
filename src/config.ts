import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  googleAI: {
    apiKey: process.env.GOOGLE_AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gemini-1.5-flash',
    maxOutputTokens: parseInt(process.env.AI_MAX_OUTPUT_TOKENS || '8192', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  mongodb: {
    uri: process.env.MONGODB_URI || '',
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '50', 10),
  },
  app: {
    version: '1.0.0',
    name: 'Medical Blog Generator API',
  },
} as const;

export function validateConfig(): void {
  if (!config.googleAI.apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is required. Set it in your .env file.');
  }
  if (!config.mongodb.uri) {
    throw new Error('MONGODB_URI is required. Set it in your .env file.');
  }
}
