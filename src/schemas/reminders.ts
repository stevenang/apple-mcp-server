import { z } from 'zod';

// Shared response_format field
const responseFormat = z
  .enum(['markdown', 'json'])
  .optional()
  .default('markdown')
  .describe("Response format: 'markdown' (default) or 'json'");

/** apple_reminders_lists */
export const remindersListsSchema = {
  response_format: responseFormat,
};

/** apple_reminders_items */
export const remindersItemsSchema = {
  list_name: z
    .string()
    .optional()
    .describe('Reminder list name. Omit to return items from all lists.'),
  include_completed: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include completed reminders (default: false)'),
  response_format: responseFormat,
};

/** apple_reminders_create */
export const remindersCreateSchema = {
  title: z.string().min(1).describe('Reminder title'),
  list_name: z
    .string()
    .optional()
    .describe('Reminder list to add to. Defaults to the first available list.'),
  notes: z.string().optional().describe('Additional notes'),
  due_date: z
    .string()
    .optional()
    .describe('Due date/time (ISO 8601, e.g. "2024-01-15T09:00:00")'),
  priority: z
    .number()
    .int()
    .min(0)
    .max(9)
    .optional()
    .describe('Priority: 0=none, 1=high, 5=medium, 9=low'),
  response_format: responseFormat,
};

/** apple_reminders_complete */
export const remindersCompleteSchema = {
  uid: z
    .string()
    .min(1)
    .describe('Reminder UID — obtained from apple_reminders_items'),
  response_format: responseFormat,
};

/** apple_reminders_delete */
export const remindersDeleteSchema = {
  uid: z
    .string()
    .min(1)
    .describe('Reminder UID — obtained from apple_reminders_items'),
  response_format: responseFormat,
};
