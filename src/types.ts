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
}

export interface Calendar {
  id: string;
  displayName: string;
  color?: string;
  description?: string;
  url: string;
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
}

export interface ContactAddress {
  type: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
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
}

export interface ReminderList {
  id: string;
  displayName: string;
  url: string;
}

export type ResponseFormat = 'markdown' | 'json';
