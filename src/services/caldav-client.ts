import { DAVClient } from 'tsdav';
import type { DAVCalendar, DAVCalendarObject } from 'tsdav';
import { randomUUID } from 'crypto';
import { CALDAV_URL } from '../constants.js';
import { getCalDavCredentials } from '../auth.js';
import type { Calendar, CalendarEvent, Reminder, ReminderList } from '../types.js';

// ---------------------------------------------------------------------------
// Input types (used by tool layer)
// ---------------------------------------------------------------------------

export interface NewCalendarEvent {
  title: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
}

export interface CalendarEventUpdates {
  title?: string;
  startDate?: Date;
  endDate?: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
}

export interface NewReminder {
  title: string;
  notes?: string;
  dueDate?: Date;
  priority?: number;
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

async function createClient(): Promise<DAVClient> {
  const { username, password } = getCalDavCredentials();
  const client = new DAVClient({
    serverUrl: CALDAV_URL,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  await client.login();
  return client;
}

// ---------------------------------------------------------------------------
// ICS parsing
// ---------------------------------------------------------------------------

interface ICSProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

type ICSComponent = Record<string, ICSProp>;

/** Unfold continuation lines per RFC 5545 §3.1 and split into individual lines. */
function unfoldLines(ics: string): string[] {
  return ics
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '') // bare-LF folding (some servers)
    .split(/\r\n|\r|\n/)
    .filter(Boolean);
}

/** Parse a single ICS property line into name, parameters, and value. */
function parseProp(line: string): ICSProp | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const nameParams = line.slice(0, colon);
  const raw = line.slice(colon + 1);
  const parts = nameParams.split(';');
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq !== -1) {
      params[parts[i].slice(0, eq).toUpperCase()] = parts[i]
        .slice(eq + 1)
        .replace(/^"|"$/g, '');
    }
  }
  return { name, params, value: unescapeICS(raw) };
}

function unescapeICS(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Extract all named components from an ICS string.
 * Handles nested components (e.g. VALARM inside VEVENT) by tracking depth.
 */
function extractComponents(ics: string, componentName: string): ICSComponent[] {
  const lines = unfoldLines(ics);
  const result: ICSComponent[] = [];
  let current: ICSComponent | null = null;
  let nestedDepth = 0;

  for (const line of lines) {
    if (line === `BEGIN:${componentName}`) {
      current = {};
      nestedDepth = 0;
    } else if (line === `END:${componentName}` && current !== null && nestedDepth === 0) {
      result.push(current);
      current = null;
    } else if (current !== null) {
      if (line.startsWith('BEGIN:')) {
        nestedDepth++;
      } else if (line.startsWith('END:')) {
        if (nestedDepth > 0) nestedDepth--;
      } else if (nestedDepth === 0) {
        const prop = parseProp(line);
        if (prop) current[prop.name] = prop;
      }
    }
  }

  return result;
}

/** Parse a DTSTART/DTEND/DUE/COMPLETED property into a Date and allDay flag. */
function parseICSDate(prop: ICSProp): { date: Date; allDay: boolean } | null {
  const { value, params } = prop;
  const isDate = params['VALUE'] === 'DATE' || /^\d{8}$/.test(value);

  if (isDate) {
    const y = parseInt(value.slice(0, 4), 10);
    const m = parseInt(value.slice(4, 6), 10) - 1;
    const d = parseInt(value.slice(6, 8), 10);
    return { date: new Date(y, m, d), allDay: true };
  }

  if (!/^\d{8}T\d{6}/.test(value)) return null;

  const y = parseInt(value.slice(0, 4), 10);
  const mo = parseInt(value.slice(4, 6), 10) - 1;
  const d = parseInt(value.slice(6, 8), 10);
  const h = parseInt(value.slice(9, 11), 10);
  const mi = parseInt(value.slice(11, 13), 10);
  const s = parseInt(value.slice(13, 15), 10);

  // UTC (Z suffix)
  if (value.endsWith('Z')) {
    return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
  }

  // Local time with or without TZID — treat as local wall clock
  return { date: new Date(y, mo, d, h, mi, s), allDay: false };
}

/** Parse a DURATION value (e.g. PT1H, P1DT2H30M) into milliseconds. */
function parseDuration(val: string): number {
  const m = val.match(
    /^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!m) return 0;
  const [, w = '0', d = '0', h = '0', mi = '0', s = '0'] = m;
  return (
    (parseInt(w, 10) * 7 + parseInt(d, 10)) * 86_400_000 +
    (parseInt(h, 10) * 3600 + parseInt(mi, 10) * 60 + parseInt(s, 10)) * 1000
  );
}

function calendarNameFromUrl(url: string): string {
  const parts = url.replace(/\/$/, '').split('/');
  return decodeURIComponent(parts[parts.length - 1] ?? url);
}

function parseVEvent(
  props: ICSComponent,
  calendarUrl: string,
  objUrl: string,
  etag?: string,
): CalendarEvent | null {
  const uid = props['UID']?.value;
  const title = props['SUMMARY']?.value;
  if (!uid || !title) return null;

  const startProp = props['DTSTART'];
  if (!startProp) return null;
  const startParsed = parseICSDate(startProp);
  if (!startParsed) return null;
  const { date: startDate, allDay } = startParsed;

  let endDate: Date;
  if (props['DTEND']) {
    const p = parseICSDate(props['DTEND']);
    if (p) {
      // All-day DTEND is exclusive; subtract 1 ms for storage as inclusive end
      endDate = allDay ? new Date(p.date.getTime() - 1) : p.date;
    } else {
      endDate = startDate;
    }
  } else if (props['DURATION']) {
    endDate = new Date(startDate.getTime() + parseDuration(props['DURATION'].value));
  } else {
    endDate = allDay ? new Date(startDate.getTime() + 86_400_000 - 1) : startDate;
  }

  return {
    id: objUrl,
    uid,
    calendarId: calendarUrl,
    calendarName: calendarNameFromUrl(calendarUrl),
    title,
    description: props['DESCRIPTION']?.value,
    location: props['LOCATION']?.value,
    startDate,
    endDate,
    allDay,
    recurrence: props['RRULE']?.value,
    url: objUrl,
    etag,
  };
}

function parseVTodo(
  props: ICSComponent,
  listUrl: string,
  objUrl: string,
  etag?: string,
): Reminder | null {
  const uid = props['UID']?.value;
  const title = props['SUMMARY']?.value;
  if (!uid || !title) return null;

  const status = props['STATUS']?.value?.toUpperCase();
  const percentDone = parseInt(props['PERCENT-COMPLETE']?.value ?? '0', 10) || 0;
  const completed = status === 'COMPLETED' || percentDone === 100;

  const completedProp = props['COMPLETED'];
  const completedDate = completedProp ? parseICSDate(completedProp)?.date : undefined;

  const dueProp = props['DUE'] ?? props['DTSTART'];
  const dueDate = dueProp ? parseICSDate(dueProp)?.date : undefined;

  return {
    id: objUrl,
    uid,
    listId: listUrl,
    listName: calendarNameFromUrl(listUrl),
    title,
    notes: props['DESCRIPTION']?.value,
    dueDate,
    completed,
    completedDate,
    priority: parseInt(props['PRIORITY']?.value ?? '0', 10) || 0,
    url: objUrl,
    etag,
  };
}

// ---------------------------------------------------------------------------
// ICS generation
// ---------------------------------------------------------------------------

function fmtDT(date: Date, allDay: boolean): string {
  if (allDay) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
  // Always emit UTC
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function fmtNow(): string {
  return fmtDT(new Date(), false);
}

function escICS(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildVEventICS(uid: string, ev: NewCalendarEvent): string {
  const now = fmtNow();
  const allDay = ev.allDay ?? false;
  // For all-day, DTEND is exclusive (the day after)
  const dtEnd = allDay ? new Date(ev.endDate.getTime() + 86_400_000) : ev.endDate;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//apple-mcp-server//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `CREATED:${now}`,
    allDay
      ? `DTSTART;VALUE=DATE:${fmtDT(ev.startDate, true)}`
      : `DTSTART:${fmtDT(ev.startDate, false)}`,
    allDay
      ? `DTEND;VALUE=DATE:${fmtDT(dtEnd, true)}`
      : `DTEND:${fmtDT(ev.endDate, false)}`,
    `SUMMARY:${escICS(ev.title)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escICS(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${escICS(ev.location)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function buildUpdatedVEventICS(
  uid: string,
  existing: ICSComponent,
  updates: CalendarEventUpdates,
): string {
  const now = fmtNow();

  // Determine current values before applying updates
  const curStartProp = existing['DTSTART'];
  const curAllDay = curStartProp
    ? curStartProp.params['VALUE'] === 'DATE' || /^\d{8}$/.test(curStartProp.value)
    : false;
  const curStart = curStartProp ? (parseICSDate(curStartProp)?.date ?? new Date()) : new Date();
  const curEndProp = existing['DTEND'];
  const curEnd = curEndProp ? (parseICSDate(curEndProp)?.date ?? curStart) : curStart;

  const allDay = updates.allDay ?? curAllDay;
  const startDate = updates.startDate ?? curStart;
  const endDate = updates.endDate ?? curEnd;
  const title = updates.title ?? existing['SUMMARY']?.value ?? '';
  const description = updates.description ?? existing['DESCRIPTION']?.value;
  const location = updates.location ?? existing['LOCATION']?.value;
  const rrule = existing['RRULE']?.value;

  const dtEnd = allDay ? new Date(endDate.getTime() + 86_400_000) : endDate;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//apple-mcp-server//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `LAST-MODIFIED:${now}`,
    allDay
      ? `DTSTART;VALUE=DATE:${fmtDT(startDate, true)}`
      : `DTSTART:${fmtDT(startDate, false)}`,
    allDay
      ? `DTEND;VALUE=DATE:${fmtDT(dtEnd, true)}`
      : `DTEND:${fmtDT(endDate, false)}`,
    `SUMMARY:${escICS(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escICS(description)}`);
  if (location) lines.push(`LOCATION:${escICS(location)}`);
  if (rrule) lines.push(`RRULE:${rrule}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function buildVTodoICS(uid: string, todo: NewReminder): string {
  const now = fmtNow();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//apple-mcp-server//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTODO',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `CREATED:${now}`,
    `SUMMARY:${escICS(todo.title)}`,
    'STATUS:NEEDS-ACTION',
  ];
  if (todo.dueDate) lines.push(`DUE:${fmtDT(todo.dueDate, false)}`);
  if (todo.notes) lines.push(`DESCRIPTION:${escICS(todo.notes)}`);
  if (todo.priority !== undefined) lines.push(`PRIORITY:${todo.priority}`);
  lines.push('END:VTODO', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function buildCompletedVTodoICS(uid: string, existing: ICSComponent): string {
  const now = fmtNow();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//apple-mcp-server//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTODO',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `LAST-MODIFIED:${now}`,
    `SUMMARY:${escICS(existing['SUMMARY']?.value ?? '')}`,
    'STATUS:COMPLETED',
    'PERCENT-COMPLETE:100',
    `COMPLETED:${now}`,
  ];
  // Preserve fields that may have been set on creation
  if (existing['DUE']) lines.push(`DUE:${existing['DUE'].value}`);
  if (existing['DESCRIPTION']) lines.push(`DESCRIPTION:${escICS(existing['DESCRIPTION'].value)}`);
  if (existing['PRIORITY']) lines.push(`PRIORITY:${existing['PRIORITY'].value}`);
  lines.push('END:VTODO', 'END:VCALENDAR');
  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// CalDAV filter helpers
// ---------------------------------------------------------------------------

// Passed to fetchCalendarObjects to retrieve VTODO items only.
// The default filter used by tsdav targets VEVENT; we must override for todos.
const VTODO_FILTER = [
  {
    'comp-filter': {
      _attributes: { name: 'VCALENDAR' },
      'comp-filter': {
        _attributes: { name: 'VTODO' },
      },
    },
  },
];

/** Fetch all objects of a given component type and find the one matching uid. */
async function findObjectByUid(
  client: DAVClient,
  calendarUrl: string,
  uid: string,
  componentType: 'VEVENT' | 'VTODO',
): Promise<DAVCalendarObject> {
  const objects = await client.fetchCalendarObjects({
    calendar: { url: calendarUrl } as DAVCalendar,
    ...(componentType === 'VTODO' ? { filters: VTODO_FILTER } : {}),
  });

  const obj = objects.find((o) => {
    if (!o.data) return false;
    return extractComponents(String(o.data), componentType).some(
      (c) => c['UID']?.value === uid,
    );
  });

  if (!obj) {
    throw new Error(`${componentType} with UID "${uid}" not found in ${calendarUrl}`);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Public API: Calendars
// ---------------------------------------------------------------------------

/** List all CalDAV calendars on the account. */
export async function listCalendars(): Promise<Calendar[]> {
  const client = await createClient();
  const cals = await client.fetchCalendars();
  return cals.map((cal) => ({
    id: cal.url,
    displayName:
      typeof cal.displayName === 'string'
        ? cal.displayName
        : calendarNameFromUrl(cal.url),
    color: cal.calendarColor,
    description: cal.description,
    url: cal.url,
  }));
}

// ---------------------------------------------------------------------------
// Public API: Events
// ---------------------------------------------------------------------------

/**
 * Fetch events from a calendar within a date range.
 * Uses CalDAV time-range REPORT — only VEVENT components are returned.
 */
export async function getEvents(
  calendarUrl: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEvent[]> {
  const client = await createClient();
  const objects = await client.fetchCalendarObjects({
    calendar: { url: calendarUrl } as DAVCalendar,
    timeRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
  });

  const events: CalendarEvent[] = [];
  for (const obj of objects) {
    if (!obj.data) continue;
    for (const props of extractComponents(String(obj.data), 'VEVENT')) {
      const ev = parseVEvent(props, calendarUrl, obj.url, obj.etag);
      if (ev) events.push(ev);
    }
  }
  return events;
}

/** Fetch a single event by UID. */
export async function getEvent(calendarUrl: string, uid: string): Promise<CalendarEvent> {
  const client = await createClient();
  const obj = await findObjectByUid(client, calendarUrl, uid, 'VEVENT');
  const vevents = extractComponents(String(obj.data), 'VEVENT');
  const props = vevents.find((c) => c['UID']?.value === uid);
  if (!props) throw new Error(`VEVENT UID "${uid}" not found`);
  const ev = parseVEvent(props, calendarUrl, obj.url, obj.etag);
  if (!ev) throw new Error(`Failed to parse VEVENT UID "${uid}"`);
  return ev;
}

/** Create a new calendar event. Returns the generated UID. */
export async function createEvent(
  calendarUrl: string,
  event: NewCalendarEvent,
): Promise<string> {
  const client = await createClient();
  const uid = randomUUID();
  const iCalString = buildVEventICS(uid, event);
  await client.createCalendarObject({
    calendar: { url: calendarUrl } as DAVCalendar,
    iCalString,
    filename: `${uid}.ics`,
  });
  return uid;
}

/** Update an existing event. Fetches the current ICS, merges updates, and PUTs back. */
export async function updateEvent(
  calendarUrl: string,
  uid: string,
  updates: CalendarEventUpdates,
): Promise<void> {
  const client = await createClient();
  const obj = await findObjectByUid(client, calendarUrl, uid, 'VEVENT');
  const vevents = extractComponents(String(obj.data), 'VEVENT');
  const existing = vevents.find((c) => c['UID']?.value === uid);
  if (!existing) throw new Error(`VEVENT UID "${uid}" not found in fetched ICS`);

  const iCalString = buildUpdatedVEventICS(uid, existing, updates);
  await client.updateCalendarObject({
    calendarObject: { url: obj.url, etag: obj.etag, data: iCalString },
  });
}

/** Delete a calendar event by UID. */
export async function deleteEvent(calendarUrl: string, uid: string): Promise<void> {
  const client = await createClient();
  const obj = await findObjectByUid(client, calendarUrl, uid, 'VEVENT');
  await client.deleteCalendarObject({
    calendarObject: { url: obj.url, etag: obj.etag },
  });
}

// ---------------------------------------------------------------------------
// Public API: Reminders (VTODO)
// ---------------------------------------------------------------------------

/**
 * List reminder lists.
 * Returns calendars whose supported components include VTODO.
 * If components metadata is absent, the calendar is included (permissive).
 */
export async function listTodoLists(): Promise<ReminderList[]> {
  const client = await createClient();
  const cals = await client.fetchCalendars();
  return cals
    .filter((c) => !c.components || c.components.includes('VTODO'))
    .map((c) => ({
      id: c.url,
      displayName:
        typeof c.displayName === 'string'
          ? c.displayName
          : calendarNameFromUrl(c.url),
      url: c.url,
    }));
}

/** Fetch reminders from a list, optionally including completed items. */
export async function getTodos(
  listUrl: string,
  includeCompleted = false,
): Promise<Reminder[]> {
  const client = await createClient();
  const objects = await client.fetchCalendarObjects({
    calendar: { url: listUrl } as DAVCalendar,
    filters: VTODO_FILTER,
  });

  const todos: Reminder[] = [];
  for (const obj of objects) {
    if (!obj.data) continue;
    for (const props of extractComponents(String(obj.data), 'VTODO')) {
      const todo = parseVTodo(props, listUrl, obj.url, obj.etag);
      if (!todo) continue;
      if (!includeCompleted && todo.completed) continue;
      todos.push(todo);
    }
  }
  return todos;
}

/** Create a new reminder. Returns the generated UID. */
export async function createTodo(listUrl: string, todo: NewReminder): Promise<string> {
  const client = await createClient();
  const uid = randomUUID();
  const iCalString = buildVTodoICS(uid, todo);
  await client.createCalendarObject({
    calendar: { url: listUrl } as DAVCalendar,
    iCalString,
    filename: `${uid}.ics`,
  });
  return uid;
}

/** Mark a reminder as complete. */
export async function completeTodo(listUrl: string, uid: string): Promise<void> {
  const client = await createClient();
  const obj = await findObjectByUid(client, listUrl, uid, 'VTODO');
  const vtodos = extractComponents(String(obj.data), 'VTODO');
  const existing = vtodos.find((c) => c['UID']?.value === uid);
  if (!existing) throw new Error(`VTODO UID "${uid}" not found in fetched ICS`);

  const iCalString = buildCompletedVTodoICS(uid, existing);
  await client.updateCalendarObject({
    calendarObject: { url: obj.url, etag: obj.etag, data: iCalString },
  });
}

/** Delete a reminder by UID. */
export async function deleteTodo(listUrl: string, uid: string): Promise<void> {
  const client = await createClient();
  const obj = await findObjectByUid(client, listUrl, uid, 'VTODO');
  await client.deleteCalendarObject({
    calendarObject: { url: obj.url, etag: obj.etag },
  });
}
