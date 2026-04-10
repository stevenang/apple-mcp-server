import { ImapFlow } from 'imapflow';
import type {
  FetchMessageObject,
  MessageAddressObject,
  MessageStructureObject,
  MailboxObject,
} from 'imapflow';
import { IMAP_SERVER, IMAP_PORT } from '../constants.js';
import { getImapAuth } from '../auth.js';
import type { EmailMessage } from '../types.js';

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function createClient(): ImapFlow {
  return new ImapFlow({
    host: IMAP_SERVER,
    port: IMAP_PORT,
    secure: true,
    auth: getImapAuth(),
    logger: false, // suppress verbose imapflow logs
  });
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function formatAddress(addr: MessageAddressObject | undefined): string {
  if (!addr) return '';
  if (addr.name && addr.address) return `${addr.name} <${addr.address}>`;
  return addr.address ?? addr.name ?? '';
}

function parseEnvelope(msg: FetchMessageObject, folder: string): EmailMessage {
  const env = msg.envelope;
  const date =
    msg.internalDate instanceof Date
      ? msg.internalDate
      : new Date(msg.internalDate ?? Date.now());

  return {
    id: msg.emailId ?? String(msg.uid),
    uid: msg.uid,
    subject: env?.subject ?? '(no subject)',
    from: formatAddress(env?.from?.[0]),
    to: (env?.to ?? []).map(formatAddress).filter(Boolean),
    cc: env?.cc?.length ? env.cc.map(formatAddress).filter(Boolean) : undefined,
    date,
    flags: msg.flags ? [...msg.flags] : [],
    folder,
  };
}

// Walk a MIME bodyStructure tree to find the IMAP part numbers of the first
// text/plain and text/html leaves. imapflow sets `part` on leaf nodes
// (e.g. "1", "2", "1.1"). A single-part (non-multipart) root node has no
// `part` field — in IMAP, part "1" refers to its body in that case.
interface TextParts {
  plain?: string;
  html?: string;
}

function findTextParts(node: MessageStructureObject): TextParts {
  const result: TextParts = {};

  if (node.childNodes?.length) {
    for (const child of node.childNodes) {
      const found = findTextParts(child);
      if (!result.plain && found.plain) result.plain = found.plain;
      if (!result.html && found.html) result.html = found.html;
      if (result.plain && result.html) break;
    }
  } else {
    const partNum = node.part ?? '1';
    const type = node.type.toLowerCase();
    if (type === 'text/plain') result.plain = partNum;
    else if (type === 'text/html') result.html = partNum;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all IMAP mailbox folders available on the account.
 */
export async function listFolders(): Promise<
  { path: string; name: string; specialUse?: string }[]
> {
  const client = createClient();
  try {
    await client.connect();
    const mailboxes = await client.list();
    return mailboxes.map((m) => ({
      path: m.path,
      name: m.name,
      specialUse: m.specialUse,
    }));
  } finally {
    client.close();
  }
}

/**
 * Fetch the most recent emails from a folder.
 *
 * @param folder     IMAP folder path (e.g. "INBOX", "Sent Messages")
 * @param count      Maximum number of messages to return
 * @param sinceDays  If provided, only return messages from the last N days
 */
export async function listMessages(
  folder: string,
  count: number,
  sinceDays?: number,
): Promise<EmailMessage[]> {
  const client = createClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const mailbox = client.mailbox as MailboxObject | false;
      if (!mailbox || mailbox.exists === 0) return [];

      let range: string | number[];
      let fetchUid = false;

      if (sinceDays !== undefined) {
        const since = new Date();
        since.setDate(since.getDate() - sinceDays);
        const uids = await client.search({ since }, { uid: true });
        if (!uids || uids.length === 0) return [];
        range = (uids as number[]).slice(-count);
        fetchUid = true;
      } else {
        // Sequence range: grab the last N messages without a full mailbox scan
        const start = Math.max(1, mailbox.exists - count + 1);
        range = `${start}:*`;
      }

      const messages = await client.fetchAll(
        range,
        { uid: true, envelope: true, flags: true, internalDate: true },
        { uid: fetchUid },
      );

      return messages.reverse().map((msg) => parseEnvelope(msg, folder));
    } finally {
      lock.release();
    }
  } finally {
    client.close();
  }
}

/**
 * Search emails in a folder by subject, body text, or sender address.
 *
 * @param folder  IMAP folder path
 * @param query   Search string matched against subject, body, and From:
 * @param count   Maximum results to return (most recent first)
 */
export async function searchMessages(
  folder: string,
  query: string,
  count: number,
): Promise<EmailMessage[]> {
  const client = createClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = await client.search(
        { or: [{ subject: query }, { body: query }, { from: query }] },
        { uid: true },
      );

      if (!uids || uids.length === 0) return [];

      const slice = (uids as number[]).slice(-count);
      const messages = await client.fetchAll(
        slice,
        { uid: true, envelope: true, flags: true, internalDate: true },
        { uid: true },
      );

      return messages.reverse().map((msg) => parseEnvelope(msg, folder));
    } finally {
      lock.release();
    }
  } finally {
    client.close();
  }
}

/**
 * Fetch the full content of a single message by UID, including body text.
 *
 * Uses two fetches: first for metadata + MIME structure, then for body parts.
 * This avoids downloading the full raw RFC 822 source for metadata-only calls.
 *
 * @param folder  IMAP folder path containing the message
 * @param uid     IMAP UID of the message
 */
export async function getMessage(folder: string, uid: number): Promise<EmailMessage> {
  const client = createClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      // Pass 1: envelope + MIME structure (no body bytes transferred)
      const meta = await client.fetchOne(
        uid.toString(),
        { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true },
        { uid: true },
      );

      if (!meta) throw new Error(`Message UID ${uid} not found in "${folder}"`);

      // Determine which MIME part numbers hold plain text and HTML
      const parts = findTextParts(meta.bodyStructure ?? { type: 'text/plain' });
      const partsToFetch = [parts.plain, parts.html].filter((p): p is string => p !== undefined);

      let body: string | undefined;
      let htmlBody: string | undefined;

      if (partsToFetch.length > 0) {
        // Pass 2: fetch only the body parts we need
        const withBody = await client.fetchOne(
          uid.toString(),
          { uid: true, bodyParts: partsToFetch },
          { uid: true },
        );
        if (withBody && withBody.bodyParts) {
          if (parts.plain) body = withBody.bodyParts.get(parts.plain)?.toString('utf-8');
          if (parts.html) htmlBody = withBody.bodyParts.get(parts.html)?.toString('utf-8');
        }
      }

      return { ...parseEnvelope(meta, folder), body, htmlBody };
    } finally {
      lock.release();
    }
  } finally {
    client.close();
  }
}

/**
 * Move a message from one IMAP folder to another.
 *
 * @param folder      Source folder path (e.g. "INBOX")
 * @param uid         IMAP UID of the message to move
 * @param destFolder  Destination folder path (e.g. "Archive", "Deleted Messages")
 */
export async function moveMessage(
  folder: string,
  uid: number,
  destFolder: string,
): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const result = await client.messageMove([uid], destFolder, { uid: true });
      if (!result) {
        throw new Error(
          `Failed to move UID ${uid} from "${folder}" to "${destFolder}"`,
        );
      }
    } finally {
      lock.release();
    }
  } finally {
    client.close();
  }
}
