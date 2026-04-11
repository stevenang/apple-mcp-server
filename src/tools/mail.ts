import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  mailListSchema,
  mailSearchSchema,
  mailReadSchema,
  mailFoldersSchema,
  mailSendSchema,
  mailMoveSchema,
} from '../schemas/mail.js';
import {
  listMessages,
  searchMessages,
  getMessage,
  listFolders,
  moveMessage,
} from '../services/imap-client.js';
import { sendEmail } from '../services/smtp-client.js';
import {
  formatEmailList,
  formatEmail,
  toJSON,
} from '../utils/formatters.js';
import { tryCatch } from '../utils/errors.js';

export function registerMailTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // apple_mail_list
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_mail_list',
    {
      title: 'List Emails',
      description: 'List recent emails from an iCloud Mail folder.',
      inputSchema: mailListSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () => listMessages(args.folder, args.count, args.since_days),
        'apple_mail_list',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const text =
        args.response_format === 'json'
          ? toJSON(result.value)
          : formatEmailList(result.value);
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_mail_search
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_mail_search',
    {
      title: 'Search Emails',
      description:
        'Search iCloud Mail by subject, body text, or From address.',
      inputSchema: mailSearchSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () => searchMessages(args.folder, args.query, args.count),
        'apple_mail_search',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const text =
        args.response_format === 'json'
          ? toJSON(result.value)
          : formatEmailList(result.value);
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_mail_read
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_mail_read',
    {
      title: 'Read Email',
      description:
        'Read the full content of an iCloud Mail message by its IMAP UID.',
      inputSchema: mailReadSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () => getMessage(args.folder, args.uid),
        'apple_mail_read',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const text =
        args.response_format === 'json'
          ? toJSON(result.value)
          : formatEmail(result.value);
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_mail_folders
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_mail_folders',
    {
      title: 'List Mail Folders',
      description: 'List all available IMAP folders in iCloud Mail.',
      inputSchema: mailFoldersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(listFolders, 'apple_mail_folders');
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const text =
        args.response_format === 'json'
          ? toJSON(result.value)
          : result.value.length
            ? result.value.map((f, i) => `${i + 1}. ${f}`).join('\n')
            : '_No folders found._';
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_mail_send
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_mail_send',
    {
      title: 'Send Email',
      description: 'Send an email via iCloud Mail (SMTP).',
      inputSchema: mailSendSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const to = Array.isArray(args.to) ? args.to : [args.to];
      const cc = args.cc
        ? Array.isArray(args.cc)
          ? args.cc
          : [args.cc]
        : undefined;
      const bcc = args.bcc
        ? Array.isArray(args.bcc)
          ? args.bcc
          : [args.bcc]
        : undefined;

      const result = await tryCatch(
        () => sendEmail(to, args.subject, args.body, cc, bcc),
        'apple_mail_send',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }

      const summary = {
        status: 'sent',
        to,
        subject: args.subject,
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
      };
      const text =
        args.response_format === 'json'
          ? toJSON(summary)
          : `Email sent to ${to.join(', ')}.`;
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_mail_move
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_mail_move',
    {
      title: 'Move Email',
      description:
        'Move an iCloud Mail message from one folder to another (e.g., archive or trash).',
      inputSchema: mailMoveSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () => moveMessage(args.folder, args.uid, args.destination),
        'apple_mail_move',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }

      const summary = {
        status: 'moved',
        uid: args.uid,
        from: args.folder,
        to: args.destination,
      };
      const text =
        args.response_format === 'json'
          ? toJSON(summary)
          : `Message ${args.uid} moved from "${args.folder}" to "${args.destination}".`;
      return { content: [{ type: 'text', text }] };
    },
  );
}
