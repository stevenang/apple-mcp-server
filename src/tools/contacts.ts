import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  contactsListSchema,
  contactsSearchSchema,
  contactsGetSchema,
  contactsCreateSchema,
  contactsUpdateSchema,
} from '../schemas/contacts.js';
import {
  listContacts,
  searchContacts,
  getContact,
  createContact,
  updateContact,
} from '../services/carddav-client.js';
import {
  formatContactList,
  formatContact,
  toJSON,
} from '../utils/formatters.js';
import { tryCatch } from '../utils/errors.js';

export function registerContactsTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // apple_contacts_list
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_contacts_list',
    {
      title: 'List Contacts',
      description: 'List iCloud contacts with optional pagination.',
      inputSchema: contactsListSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () => listContacts(args.limit, args.offset),
        'apple_contacts_list',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const { items, total, offset, limit, has_more } = result.value;
      if (args.response_format === 'json') {
        return { content: [{ type: 'text', text: toJSON(result.value) }] };
      }
      const list = formatContactList(items);
      const footer = `\n\n_Showing ${offset + 1}–${offset + items.length} of ${total}${has_more ? `. Use offset=${offset + limit} to see more.` : '.'}_`;
      return { content: [{ type: 'text', text: list + (items.length ? footer : '') }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_contacts_search
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_contacts_search',
    {
      title: 'Search Contacts',
      description: 'Search iCloud contacts by name, email, phone, or organization.',
      inputSchema: contactsSearchSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () => searchContacts(args.query),
        'apple_contacts_search',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const text =
        args.response_format === 'json'
          ? toJSON(result.value)
          : formatContactList(result.value);
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_contacts_get
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_contacts_get',
    {
      title: 'Get Contact',
      description: 'Get full details of an iCloud contact by UID.',
      inputSchema: contactsGetSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () => getContact(args.uid),
        'apple_contacts_get',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const text =
        args.response_format === 'json'
          ? toJSON(result.value)
          : formatContact(result.value);
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_contacts_create
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_contacts_create',
    {
      title: 'Create Contact',
      description: 'Create a new contact in iCloud.',
      inputSchema: contactsCreateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () =>
          createContact({
            firstName: args.first_name,
            lastName: args.last_name,
            fullName: args.full_name,
            emails: args.emails,
            phones: args.phones,
            organization: args.organization,
            notes: args.notes,
            addresses: args.addresses,
          }),
        'apple_contacts_create',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const summary = { status: 'created', uid: result.value };
      const text =
        args.response_format === 'json'
          ? toJSON(summary)
          : `Contact created. UID: \`${result.value}\``;
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_contacts_update
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_contacts_update',
    {
      title: 'Update Contact',
      description: 'Update an existing iCloud contact by UID.',
      inputSchema: contactsUpdateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const result = await tryCatch(
        () =>
          updateContact(args.uid, {
            firstName: args.first_name,
            lastName: args.last_name,
            fullName: args.full_name,
            emails: args.emails,
            phones: args.phones,
            organization: args.organization,
            notes: args.notes,
            addresses: args.addresses,
          }),
        'apple_contacts_update',
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const summary = { status: 'updated', uid: args.uid };
      const text =
        args.response_format === 'json'
          ? toJSON(summary)
          : `Contact \`${args.uid}\` updated.`;
      return { content: [{ type: 'text', text }] };
    },
  );
}
