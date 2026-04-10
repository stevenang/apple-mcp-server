import type { ResponseFormat } from '../types.js';

export function toMarkdown(data: unknown): string {
  if (typeof data === 'string') return data;
  return '```json\n' + JSON.stringify(data, null, 2) + '\n```';
}

export function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatResponse(data: unknown, format: ResponseFormat): string {
  return format === 'json' ? toJSON(data) : toMarkdown(data);
}
