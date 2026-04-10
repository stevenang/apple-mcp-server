import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../constants.js';

export interface PaginationParams {
  offset?: number;
  limit?: number;
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export function paginate<T>(
  items: T[],
  { offset = 0, limit = DEFAULT_PAGE_LIMIT }: PaginationParams
): PaginationResult<T> {
  const safeLimit = Math.min(limit, MAX_PAGE_LIMIT);
  const slice = items.slice(offset, offset + safeLimit);
  return {
    items: slice,
    total: items.length,
    offset,
    limit: safeLimit,
    has_more: offset + safeLimit < items.length,
  };
}
