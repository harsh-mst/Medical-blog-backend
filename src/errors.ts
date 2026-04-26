export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class AIServiceError extends AppError {
  constructor(message: string, public readonly originalError?: unknown) {
    super(503, 'AI_SERVICE_ERROR', message);
    this.name = 'AIServiceError';
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.');
    this.name = 'RateLimitError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(500, 'CONFIGURATION_ERROR', message, false);
    this.name = 'ConfigurationError';
  }
}

export function isOperationalError(error: unknown): boolean {
  return error instanceof AppError && error.isOperational;
}
