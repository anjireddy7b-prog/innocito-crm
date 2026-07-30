import pino from 'pino';
import { env, isProd } from '@/config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
});
