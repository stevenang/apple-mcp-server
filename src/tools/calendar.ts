import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  calListSchema,
  calEventsSchema,
  calGetEventSchema,
  calCreateSchema,
  calUpdateSchema,
  calDeleteSchema,
} from '../schemas/calendar.js';
import {
  listCalendars,
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../services/caldav-client.js';
import type { CalendarEventUpdates } from '../services/caldav-client.js';
import {
  formatCalendarList,
  formatEventList,
  formatEvent,
  toJSON,
} from '../utils/formatters.js';
import { tryCatch, handleError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Helper: resolve calendar URL(s) by optional display name
// ---------------------------------------------------------------------------

async function resolveCalendarUrls(calendarName?: string): Promise<string[]> {
  const cals = await listCalendars();
  if (!cals.length) throw new Error('No calendars found on iCloud CalDAV.');
  if (!calendarName) return cals.map((c) => c.url);
  const match = cals.find(
    (c) => c.displayName.toLowerCase() === calendarName.toLowerCase(),
  );
  if (!match) {
    const names = cals.map((c) => c.displayName).join(', ');
    throw new Error(
      `Calendar "${calendarName}" not found. Available calendars: ${names}`,
    );
  }
  return [match.url];
}

async function resolveFirstCalendarUrl(calendarName?: string): Promise<string> {
  const urls = await resolveCalendarUrls(calendarName);
  return urls[0];
}

// ---------------------------------------------------------------------------
// Helper: search across all calendars for an event by UID
// ---------------------------------------------------------------------------

async function findEventAcrossCalendars(
  uid: string,
): Promise<{ calendarUrl: string }> {
  const cals = await listCalendars();
  for (const cal of cals) {
    try {
      await getEvent(cal.url, uid);
      return { calendarUrl: cal.url };
    } catch {
      // not in this calendar
    }
  }
  throw new Error(`Event UID "${uid}" not found in any calendar.`);
}

export function registerCalendarTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // apple_cal_list
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_cal_list',
    {
      title: 'List Calendars',
      description: 'List all iCloud calendars with their names and colors.',
      inputSchema: calListSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(listCalendars, 'apple_cal_list');
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const text =
        args.response_format === 'json'
          ? toJSON(result.value)
          : formatCalendarList(result.value);
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_cal_events
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_cal_events',
    {
      title: 'Get Calendar Events',
      description: 'Get iCloud calendar events within a date range.',
      inputSchema: calEventsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const startDate = new Date(args.start);
      const endDate = new Date(args.end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return {
          content: [{ type: 'text', text: 'Invalid date format. Use ISO 8601 (e.g. "2024-01-01").' }],
          isError: true,
        };
      }
      try {
        const calUrls = await resolveCalendarUrls(args.calendar_name);
        const allEvents = await Promise.all(
          calUrls.map((url) => getEvents(url, startDate, endDate)),
        );
        const events = allEvents.flat().sort(
          (a, b) => a.startDate.getTime() - b.startDate.getTime(),
        );
        const text =
          args.response_format === 'json'
            ? toJSON(events)
            : formatEventList(events);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_cal_events') }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // apple_cal_get_event
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_cal_get_event',
    {
      title: 'Get Calendar Event',
      description: 'Get full details of a specific iCloud calendar event by UID.',
      inputSchema: calGetEventSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const { calendarUrl } = await findEventAcrossCalendars(args.uid);
        const event = await getEvent(calendarUrl, args.uid);
        const text =
          args.response_format === 'json'
            ? toJSON(event)
            : formatEvent(event);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_cal_get_event') }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // apple_cal_create
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_cal_create',
    {
      title: 'Create Calendar Event',
      description: 'Create a new event in an iCloud calendar.',
      inputSchema: calCreateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const startDate = new Date(args.start);
      const endDate = new Date(args.end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return {
          content: [{ type: 'text', text: 'Invalid date format. Use ISO 8601 (e.g. "2024-01-01").' }],
          isError: true,
        };
      }
      try {
        const calUrl = await resolveFirstCalendarUrl(args.calendar_name);
        const uid = await createEvent(calUrl, {
          title: args.title,
          startDate,
          endDate,
          allDay: args.all_day,
          description: args.description,
          location: args.location,
        });
        const summary = { status: 'created', uid };
        const text =
          args.response_format === 'json'
            ? toJSON(summary)
            : `Event "${args.title}" created. UID: \`${uid}\``;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_cal_create') }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // apple_cal_update
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_cal_update',
    {
      title: 'Update Calendar Event',
      description: 'Update an existing iCloud calendar event.',
      inputSchema: calUpdateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const updates: CalendarEventUpdates = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.start !== undefined) {
        const d = new Date(args.start);
        if (isNaN(d.getTime())) {
          return {
            content: [{ type: 'text', text: 'Invalid start date. Use ISO 8601.' }],
            isError: true,
          };
        }
        updates.startDate = d;
      }
      if (args.end !== undefined) {
        const d = new Date(args.end);
        if (isNaN(d.getTime())) {
          return {
            content: [{ type: 'text', text: 'Invalid end date. Use ISO 8601.' }],
            isError: true,
          };
        }
        updates.endDate = d;
      }
      if (args.all_day !== undefined) updates.allDay = args.all_day;
      if (args.description !== undefined) updates.description = args.description;
      if (args.location !== undefined) updates.location = args.location;

      try {
        const { calendarUrl } = await findEventAcrossCalendars(args.uid);
        await updateEvent(calendarUrl, args.uid, updates);
        const summary = { status: 'updated', uid: args.uid };
        const text =
          args.response_format === 'json'
            ? toJSON(summary)
            : `Event \`${args.uid}\` updated.`;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_cal_update') }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // apple_cal_delete
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_cal_delete',
    {
      title: 'Delete Calendar Event',
      description: 'Delete an iCloud calendar event by UID.',
      inputSchema: calDeleteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const { calendarUrl } = await findEventAcrossCalendars(args.uid);
        await deleteEvent(calendarUrl, args.uid);
        const summary = { status: 'deleted', uid: args.uid };
        const text =
          args.response_format === 'json'
            ? toJSON(summary)
            : `Event \`${args.uid}\` deleted.`;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_cal_delete') }],
          isError: true,
        };
      }
    },
  );
}
