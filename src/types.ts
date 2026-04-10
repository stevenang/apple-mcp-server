// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export interface EmailMessage {
  id: string;
  uid: number;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  date: Date;
  body?: string;
  htmlBody?: string;
  flags: string[];
  folder: string;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface Calendar {
  id: string;
  displayName: string;
  color?: string;
  description?: string;
  url: string;
}

export interface CalendarEvent {
  id: string;
  uid: string;
  calendarId: string;
  calendarName: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  recurrence?: string;
  url?: string;
  /** ETag from the CalDAV server — required for update/delete to avoid conflicts. */
  etag?: string;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface ContactAddress {
  type: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Contact {
  id: string;
  uid: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  emails: string[];
  phones: string[];
  addresses: ContactAddress[];
  organization?: string;
  notes?: string;
  url?: string;
  /** ETag from the CardDAV server — required for update operations. */
  etag?: string;
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export interface ReminderList {
  id: string;
  displayName: string;
  url: string;
}

export interface Reminder {
  id: string;
  uid: string;
  listId: string;
  listName: string;
  title: string;
  notes?: string;
  dueDate?: Date;
  completed: boolean;
  completedDate?: Date;
  priority: number;
  url?: string;
  /** ETag from the CalDAV server — required for complete/delete operations. */
  etag?: string;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type ResponseFormat = 'markdown' | 'json';
