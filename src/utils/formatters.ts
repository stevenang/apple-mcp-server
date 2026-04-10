import type { EmailMessage, CalendarEvent, Calendar, Contact, Reminder, ReminderList, ResponseFormat } from '../types.js';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDateOnly(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export function formatEmail(msg: EmailMessage): string {
  const lines: string[] = [
    `**Subject:** ${msg.subject || '(no subject)'}`,
    `**From:** ${msg.from}`,
    `**To:** ${msg.to.join(', ')}`,
  ];
  if (msg.cc?.length) lines.push(`**CC:** ${msg.cc.join(', ')}`);
  lines.push(`**Date:** ${formatDate(msg.date)}`);
  lines.push(`**Folder:** ${msg.folder}`);
  if (msg.flags.length) lines.push(`**Flags:** ${msg.flags.join(', ')}`);
  if (msg.body) {
    lines.push('', '---', '', msg.body.trim());
  }
  return lines.join('\n');
}

export function formatEmailList(messages: EmailMessage[]): string {
  if (!messages.length) return '_No messages found._';
  return messages.map((m, i) =>
    `${i + 1}. **${m.subject || '(no subject)'}**\n   From: ${m.from} · ${formatDate(m.date)} · ID: \`${m.id}\``
  ).join('\n');
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export function formatCalendar(cal: Calendar): string {
  const lines = [`**${cal.displayName}**`];
  if (cal.color) lines.push(`Color: ${cal.color}`);
  if (cal.description) lines.push(cal.description);
  return lines.join(' · ');
}

export function formatCalendarList(calendars: Calendar[]): string {
  if (!calendars.length) return '_No calendars found._';
  return calendars.map(formatCalendar).join('\n');
}

export function formatEvent(event: CalendarEvent): string {
  const dateStr = event.allDay
    ? `${formatDateOnly(event.startDate)} (all day)`
    : `${formatDate(event.startDate)} → ${formatDate(event.endDate)}`;

  const lines: string[] = [
    `**${event.title}**`,
    `**Calendar:** ${event.calendarName}`,
    `**When:** ${dateStr}`,
  ];
  if (event.location) lines.push(`**Where:** ${event.location}`);
  if (event.description) lines.push(`**Notes:** ${event.description.trim()}`);
  if (event.recurrence) lines.push(`**Repeats:** ${event.recurrence}`);
  lines.push(`**ID:** \`${event.uid}\``);
  return lines.join('\n');
}

export function formatEventList(events: CalendarEvent[]): string {
  if (!events.length) return '_No events found._';
  return events.map((e, i) => {
    const dateStr = e.allDay
      ? formatDateOnly(e.startDate)
      : formatDate(e.startDate);
    return `${i + 1}. **${e.title}** · ${dateStr} · \`${e.uid}\``;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function formatContact(contact: Contact): string {
  const lines: string[] = [`**${contact.fullName}**`];
  if (contact.organization) lines.push(`**Organization:** ${contact.organization}`);
  if (contact.emails.length) lines.push(`**Email:** ${contact.emails.join(', ')}`);
  if (contact.phones.length) lines.push(`**Phone:** ${contact.phones.join(', ')}`);
  if (contact.addresses.length) {
    const addr = contact.addresses[0];
    const parts = [addr.street, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean);
    if (parts.length) lines.push(`**Address:** ${parts.join(', ')}`);
  }
  if (contact.notes) lines.push(`**Notes:** ${contact.notes.trim()}`);
  lines.push(`**ID:** \`${contact.uid}\``);
  return lines.join('\n');
}

export function formatContactList(contacts: Contact[]): string {
  if (!contacts.length) return '_No contacts found._';
  return contacts.map((c, i) => {
    const detail = c.emails[0] ?? c.phones[0] ?? c.organization ?? '';
    return `${i + 1}. **${c.fullName}**${detail ? ` · ${detail}` : ''} · \`${c.uid}\``;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export function formatReminderList(list: ReminderList): string {
  return `**${list.displayName}** · \`${list.id}\``;
}

export function formatReminder(reminder: Reminder): string {
  const lines: string[] = [
    `**${reminder.title}**`,
    `**List:** ${reminder.listName}`,
    `**Status:** ${reminder.completed ? `Completed${reminder.completedDate ? ` on ${formatDateOnly(reminder.completedDate)}` : ''}` : 'Incomplete'}`,
  ];
  if (reminder.dueDate) lines.push(`**Due:** ${formatDate(reminder.dueDate)}`);
  if (reminder.priority > 0) lines.push(`**Priority:** ${reminder.priority}`);
  if (reminder.notes) lines.push(`**Notes:** ${reminder.notes.trim()}`);
  lines.push(`**ID:** \`${reminder.uid}\``);
  return lines.join('\n');
}

export function formatReminderItems(reminders: Reminder[]): string {
  if (!reminders.length) return '_No reminders found._';
  return reminders.map((r, i) => {
    const due = r.dueDate ? ` · Due: ${formatDateOnly(r.dueDate)}` : '';
    const status = r.completed ? ' ✓' : '';
    return `${i + 1}.${status} **${r.title}**${due} · \`${r.uid}\``;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Generic dispatch
// ---------------------------------------------------------------------------

export function formatResponse(data: unknown, format: ResponseFormat): string {
  return format === 'json' ? toJSON(data) : String(data);
}
