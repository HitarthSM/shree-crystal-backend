import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Standard successful response envelope:
 * { success: true, data: T, message: string }
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  message: string;
}

/**
 * ResponseInterceptor — wraps every successful response in the project-standard
 * envelope so all API consumers get a consistent shape.
 *
 * Wired globally in main.ts so no module has to opt-in.
 *
 * The envelope is intentionally NOT applied to streaming responses or file
 * downloads (those handlers should use @SkipInterceptor or return a StreamableFile).
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        message: 'OK',
      })),
    );
  }
}
