import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  remindersListsSchema,
  remindersItemsSchema,
  remindersCreateSchema,
  remindersCompleteSchema,
  remindersDeleteSchema,
} from '../schemas/reminders.js';
import {
  listTodoLists,
  getTodos,
  createTodo,
  completeTodo,
  deleteTodo,
} from '../services/caldav-client.js';
import {
  formatReminderList,
  formatReminderItems,
  toJSON,
} from '../utils/formatters.js';
import { tryCatch, handleError } from '../utils/errors.js';
import type { ReminderList } from '../types.js';

// ---------------------------------------------------------------------------
// Helper: resolve list URL(s) by optional display name
// ---------------------------------------------------------------------------

async function resolveListUrls(listName?: string): Promise<ReminderList[]> {
  const lists = await listTodoLists();
  if (!lists.length) throw new Error('No reminder lists found on iCloud CalDAV.');
  if (!listName) return lists;
  const match = lists.find(
    (l) => l.displayName.toLowerCase() === listName.toLowerCase(),
  );
  if (!match) {
    const names = lists.map((l) => l.displayName).join(', ');
    throw new Error(
      `Reminder list "${listName}" not found. Available lists: ${names}`,
    );
  }
  return [match];
}

async function resolveFirstListUrl(listName?: string): Promise<string> {
  const lists = await resolveListUrls(listName);
  return lists[0].url;
}

// ---------------------------------------------------------------------------
// Helper: find a reminder's list URL by UID
// ---------------------------------------------------------------------------

async function findTodoListUrl(uid: string): Promise<string> {
  const lists = await listTodoLists();
  for (const list of lists) {
    const todos = await getTodos(list.url, true);
    if (todos.some((t) => t.uid === uid)) return list.url;
  }
  throw new Error(`Reminder UID "${uid}" not found in any list.`);
}

export function registerRemindersTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // apple_reminders_lists
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_reminders_lists',
    {
      title: 'List Reminder Lists',
      description: 'List all iCloud reminder lists.',
      inputSchema: remindersListsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await tryCatch(listTodoLists, 'apple_reminders_lists');
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const text =
        args.response_format === 'json'
          ? toJSON(result.value)
          : result.value.length
            ? result.value.map(formatReminderList).join('\n')
            : '_No reminder lists found._';
      return { content: [{ type: 'text', text }] };
    },
  );

  // -------------------------------------------------------------------------
  // apple_reminders_items
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_reminders_items',
    {
      title: 'Get Reminders',
      description: 'Get reminders from one or all iCloud reminder lists.',
      inputSchema: remindersItemsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const lists = await resolveListUrls(args.list_name);
        const allTodos = await Promise.all(
          lists.map((l) => getTodos(l.url, args.include_completed)),
        );
        const todos = allTodos.flat();
        const text =
          args.response_format === 'json'
            ? toJSON(todos)
            : formatReminderItems(todos);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_reminders_items') }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // apple_reminders_create
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_reminders_create',
    {
      title: 'Create Reminder',
      description: 'Create a new reminder in an iCloud reminder list.',
      inputSchema: remindersCreateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      let dueDate: Date | undefined;
      if (args.due_date) {
        dueDate = new Date(args.due_date);
        if (isNaN(dueDate.getTime())) {
          return {
            content: [{ type: 'text', text: 'Invalid due_date. Use ISO 8601 (e.g. "2024-01-15T09:00:00").' }],
            isError: true,
          };
        }
      }
      try {
        const listUrl = await resolveFirstListUrl(args.list_name);
        const uid = await createTodo(listUrl, {
          title: args.title,
          notes: args.notes,
          dueDate,
          priority: args.priority,
        });
        const summary = { status: 'created', uid };
        const text =
          args.response_format === 'json'
            ? toJSON(summary)
            : `Reminder "${args.title}" created. UID: \`${uid}\``;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_reminders_create') }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // apple_reminders_complete
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_reminders_complete',
    {
      title: 'Complete Reminder',
      description: 'Mark an iCloud reminder as completed.',
      inputSchema: remindersCompleteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const listUrl = await findTodoListUrl(args.uid);
        await completeTodo(listUrl, args.uid);
        const summary = { status: 'completed', uid: args.uid };
        const text =
          args.response_format === 'json'
            ? toJSON(summary)
            : `Reminder \`${args.uid}\` marked as completed.`;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_reminders_complete') }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // apple_reminders_delete
  // -------------------------------------------------------------------------
  server.registerTool(
    'apple_reminders_delete',
    {
      title: 'Delete Reminder',
      description: 'Delete an iCloud reminder.',
      inputSchema: remindersDeleteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const listUrl = await findTodoListUrl(args.uid);
        await deleteTodo(listUrl, args.uid);
        const summary = { status: 'deleted', uid: args.uid };
        const text =
          args.response_format === 'json'
            ? toJSON(summary)
            : `Reminder \`${args.uid}\` deleted.`;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: handleError(err, 'apple_reminders_delete') }],
          isError: true,
        };
      }
    },
  );
}
