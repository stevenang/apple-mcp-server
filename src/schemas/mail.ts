import { z } from 'zod';
import { IMAP_FOLDERS } from '../constants.js';

// Shared response_format field included in every mail tool schema
const responseFormat = z
  .enum(['markdown', 'json'])
  .optional()
  .default('markdown')
  .describe("Response format: 'markdown' (default) or 'json'");

const folderList = Object.values(IMAP_FOLDERS).join(', ');

/** apple_mail_list */
export const mailListSchema = {
  folder: z
    .string()
    .optional()
    .default(IMAP_FOLDERS.INBOX)
    .describe(`IMAP folder to list. Default: INBOX. iCloud folders: ${folderList}`),
  count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Maximum number of messages to return (1–100, default 20)'),
  since_days: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Only return messages received within the last N days'),
  response_format: responseFormat,
};

/** apple_mail_search */
export const mailSearchSchema = {
  query: z
    .string()
    .min(1)
    .describe('Search string matched against subject, body text, and From address'),
  folder: z
    .string()
    .optional()
    .default(IMAP_FOLDERS.INBOX)
    .describe(`IMAP folder to search. Default: INBOX. iCloud folders: ${folderList}`),
  count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Maximum results to return (1–100, default 20)'),
  response_format: responseFormat,
};

/** apple_mail_read */
export const mailReadSchema = {
  folder: z
    .string()
    .describe('IMAP folder containing the message (e.g. "INBOX", "Sent Messages")'),
  uid: z
    .number()
    .int()
    .positive()
    .describe('IMAP UID of the message — obtained from apple_mail_list or apple_mail_search'),
  response_format: responseFormat,
};

/** apple_mail_folders */
export const mailFoldersSchema = {
  response_format: responseFormat,
};

/** apple_mail_send */
export const mailSendSchema = {
  to: z
    .union([z.string().email(), z.array(z.string().email()).min(1)])
    .describe('Recipient address or array of addresses'),
  subject: z
    .string()
    .min(1)
    .describe('Email subject line'),
  body: z
    .string()
    .min(1)
    .describe('Plain-text email body'),
  cc: z
    .union([z.string().email(), z.array(z.string().email())])
    .optional()
    .describe('CC recipient(s)'),
  bcc: z
    .union([z.string().email(), z.array(z.string().email())])
    .optional()
    .describe('BCC recipient(s)'),
  response_format: responseFormat,
};

/** apple_mail_move */
export const mailMoveSchema = {
  folder: z
    .string()
    .describe('Source IMAP folder (e.g. "INBOX")'),
  uid: z
    .number()
    .int()
    .positive()
    .describe('IMAP UID of the message to move'),
  destination: z
    .string()
    .describe('Destination folder (e.g. "Archive", "Deleted Messages")'),
  response_format: responseFormat,
};
