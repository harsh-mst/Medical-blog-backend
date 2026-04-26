import winston from 'winston';

const { combine, timestamp, colorize, printf, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: combine(timestamp({ format: 'HH:mm:ss' }), colorize(), consoleFormat),
  }),
];

if (process.env.NODE_ENV !== 'production') {
  transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  transports.push(new winston.transports.File({ filename: 'logs/combined.log' }));
}

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), json()),
  transports,
});
