import { z } from 'zod';

// Shared response_format field
const responseFormat = z
  .enum(['markdown', 'json'])
  .optional()
  .default('markdown')
  .describe("Response format: 'markdown' (default) or 'json'");

/** apple_cal_list */
export const calListSchema = {
  response_format: responseFormat,
};

/** apple_cal_events */
export const calEventsSchema = {
  start: z
    .string()
    .describe('Start of date range (ISO 8601, e.g. "2024-01-01" or "2024-01-01T00:00:00")'),
  end: z
    .string()
    .describe('End of date range (ISO 8601, e.g. "2024-01-31" or "2024-01-31T23:59:59")'),
  calendar_name: z
    .string()
    .optional()
    .describe('Filter to a specific calendar by display name. Omit to return events from all calendars.'),
  response_format: responseFormat,
};

/** apple_cal_get_event */
export const calGetEventSchema = {
  uid: z
    .string()
    .min(1)
    .describe('Event UID — obtained from apple_cal_events'),
  response_format: responseFormat,
};

/** apple_cal_create */
export const calCreateSchema = {
  title: z.string().min(1).describe('Event title'),
  start: z
    .string()
    .describe('Start date/time (ISO 8601). Use date-only "YYYY-MM-DD" for all-day events.'),
  end: z
    .string()
    .describe('End date/time (ISO 8601). Use date-only "YYYY-MM-DD" for all-day events.'),
  all_day: z
    .boolean()
    .optional()
    .default(false)
    .describe('Mark as an all-day event (default: false)'),
  description: z.string().optional().describe('Event notes or description'),
  location: z.string().optional().describe('Event location'),
  calendar_name: z
    .string()
    .optional()
    .describe('Calendar to add the event to. Defaults to the first available calendar.'),
  response_format: responseFormat,
};

/** apple_cal_update */
export const calUpdateSchema = {
  uid: z
    .string()
    .min(1)
    .describe('Event UID — obtained from apple_cal_events or apple_cal_get_event'),
  title: z.string().min(1).optional().describe('New event title'),
  start: z.string().optional().describe('New start date/time (ISO 8601)'),
  end: z.string().optional().describe('New end date/time (ISO 8601)'),
  all_day: z.boolean().optional().describe('Change all-day status'),
  description: z.string().optional().describe('New notes or description'),
  location: z.string().optional().describe('New location'),
  response_format: responseFormat,
};

/** apple_cal_delete */
export const calDeleteSchema = {
  uid: z
    .string()
    .min(1)
    .describe('Event UID — obtained from apple_cal_events or apple_cal_get_event'),
  response_format: responseFormat,
};
