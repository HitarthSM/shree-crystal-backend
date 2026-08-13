import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

/**
 * Standard error envelope returned by every failed request.
 */
export interface ErrorEnvelope {
  success: false;
  error: {
    code: number;
    message: string;
  };
}

/**
 * HttpExceptionFilter — global catch-all exception filter.
 *
 * - HttpExceptions: uses their status code + message.
 * - All other exceptions: returns 500 with a sanitised message.
 * - In PRODUCTION: raw DB errors, stack traces, and internal messages are
 *   stripped. Only the HTTP status code and a safe, human-readable message are
 *   returned to the client.
 * - In DEVELOPMENT: the original error message is forwarded for easier debugging.
 *
 * Wired globally in main.ts so it applies to every request without any
 * module-level configuration.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(configService: ConfigService) {
    this.isProduction = configService.get<string>('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let clientMessage: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        clientMessage = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        // ValidationPipe returns { message: string[] } — join for readability.
        const msg = exceptionResponse.message;
        clientMessage = Array.isArray(msg) ? msg.join('; ') : String(msg);
      } else {
        clientMessage = exception.message;
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

      if (this.isProduction) {
        clientMessage = 'Internal server error';
      } else {
        clientMessage =
          exception instanceof Error ? exception.message : 'An unexpected error occurred';
      }

      // Always log the full error server-side.
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: statusCode,
        message: clientMessage,
      },
    };

    response.status(statusCode).json(body);
  }
}
