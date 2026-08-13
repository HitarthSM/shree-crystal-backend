import { ApiProperty } from '@nestjs/swagger';

/**
 * Generic paginated response wrapper.
 *
 * @example
 * // In a service:
 * return new PaginatedResponseDto(items, total, page, limit);
 *
 * // Or build manually:
 * const response: PaginatedResponseDto<Member> = { data, total, page, limit };
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ description: 'Total number of matching records' })
  total: number;

  @ApiProperty({ description: 'Current page (1-indexed)' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.total = total;
    this.page = page;
    this.limit = limit;
  }
}
