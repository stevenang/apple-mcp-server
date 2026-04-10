import { DAVClient } from 'tsdav';
import type { DAVAddressBook, DAVVCard } from 'tsdav';
import { randomUUID } from 'crypto';
import { CARDDAV_URL } from '../constants.js';
import { getCardDavCredentials } from '../auth.js';
import { paginate } from '../utils/pagination.js';
import type { Contact, ContactAddress } from '../types.js';
import type { PaginationResult } from '../utils/pagination.js';

// ---------------------------------------------------------------------------
// Input types (used by tool layer)
// ---------------------------------------------------------------------------

export interface NewContact {
  firstName?: string;
  lastName?: string;
  /** If omitted, derived from firstName + lastName. */
  fullName?: string;
  emails?: string[];
  phones?: string[];
  organization?: string;
  notes?: string;
  addresses?: ContactAddress[];
}

export interface ContactUpdates {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  emails?: string[];
  phones?: string[];
  organization?: string;
  notes?: string;
  addresses?: ContactAddress[];
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

async function createClient(): Promise<DAVClient> {
  const { username, password } = getCardDavCredentials();
  const client = new DAVClient({
    serverUrl: CARDDAV_URL,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'carddav',
  });
  await client.login();
  return client;
}

// ---------------------------------------------------------------------------
// Address book helpers
// ---------------------------------------------------------------------------

async function getDefaultAddressBook(client: DAVClient): Promise<DAVAddressBook> {
  const books = await client.fetchAddressBooks();
  if (!books.length) throw new Error('No address books found on iCloud CardDAV');
  return books[0];
}

async function getAllVCards(
  client: DAVClient,
): Promise<{ vcard: DAVVCard; addressBookUrl: string }[]> {
  const books = await client.fetchAddressBooks();
  const results: { vcard: DAVVCard; addressBookUrl: string }[] = [];
  for (const book of books) {
    const vcards = await client.fetchVCards({ addressBook: book });
    for (const vc of vcards) {
      results.push({ vcard: vc, addressBookUrl: book.url });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// vCard 3.0 parsing
// ---------------------------------------------------------------------------

interface VCardProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Unfold continuation lines per RFC 6350 §3.2 and split. */
function unfoldVCard(data: string): string[] {
  return data
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '') // bare-LF servers
    .split(/\r\n|\r|\n/)
    .filter(Boolean);
}

/** Parse one vCard property line. */
function parseProp(line: string): VCardProp | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const nameParams = line.slice(0, colon);
  const rawValue = line.slice(colon + 1);
  const segments = nameParams.split(';');
  const name = segments[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < segments.length; i++) {
    const eq = segments[i].indexOf('=');
    if (eq !== -1) {
      const key = segments[i].slice(0, eq).toUpperCase();
      const val = segments[i].slice(eq + 1).replace(/^"|"$/g, '');
      // TYPE can appear multiple times; merge with comma
      params[key] = params[key] ? `${params[key]},${val}` : val;
    } else {
      // Bare type token: TEL;CELL:... treated as TYPE=CELL
      params['TYPE'] = params['TYPE']
        ? `${params['TYPE']},${segments[i].toUpperCase()}`
        : segments[i].toUpperCase();
    }
  }
  return { name, params, value: rawValue };
}

function unescapeVCard(v: string): string {
  return v
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Split a structured vCard value (e.g. ADR, N) on unescaped semicolons,
 * then unescape each component.
 */
function splitStructured(v: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) {
      cur += v[i] + v[i + 1];
      i++;
    } else if (v[i] === ';') {
      parts.push(unescapeVCard(cur));
      cur = '';
    } else {
      cur += v[i];
    }
  }
  parts.push(unescapeVCard(cur));
  return parts;
}

function getProp(props: VCardProp[], name: string): VCardProp | undefined {
  return props.find((p) => p.name === name);
}

function getProps(props: VCardProp[], name: string): VCardProp[] {
  return props.filter((p) => p.name === name);
}

function parseVCard(data: string, objUrl: string, etag?: string): Contact | null {
  const lines = unfoldVCard(data);
  const props: VCardProp[] = [];
  for (const line of lines) {
    const prop = parseProp(line);
    if (prop && prop.name !== 'BEGIN' && prop.name !== 'END' && prop.name !== 'VERSION') {
      props.push(prop);
    }
  }

  const fn = getProp(props, 'FN');
  if (!fn) return null; // FN is mandatory; skip malformed cards
  const fullName = unescapeVCard(fn.value);

  const uidProp = getProp(props, 'UID');
  const uid = uidProp ? unescapeVCard(uidProp.value) : objUrl.split('/').pop()?.replace('.vcf', '') ?? objUrl;

  // Structured name: N:Last;First;Middle;Prefix;Suffix
  let firstName: string | undefined;
  let lastName: string | undefined;
  const nProp = getProp(props, 'N');
  if (nProp) {
    const parts = splitStructured(nProp.value);
    lastName = parts[0] || undefined;
    firstName = parts[1] || undefined;
  }

  const emails = getProps(props, 'EMAIL')
    .map((p) => unescapeVCard(p.value))
    .filter(Boolean);

  const phones = getProps(props, 'TEL')
    .map((p) => unescapeVCard(p.value))
    .filter(Boolean);

  // ADR: ;;street;city;state;postal;country
  const addresses: ContactAddress[] = getProps(props, 'ADR').map((p) => {
    const parts = splitStructured(p.value);
    const rawType = p.params['TYPE'] ?? 'home';
    // Use first token of a potentially comma-separated type list
    const type = rawType.toLowerCase().split(',')[0].trim();
    return {
      type,
      street: parts[2] || undefined,
      city: parts[3] || undefined,
      state: parts[4] || undefined,
      postalCode: parts[5] || undefined,
      country: parts[6] || undefined,
    };
  });

  // ORG may have multiple components separated by ; (org;department)
  const orgProp = getProp(props, 'ORG');
  const organization = orgProp
    ? unescapeVCard(splitStructured(orgProp.value)[0] ?? '')
    : undefined;

  const noteProp = getProp(props, 'NOTE');
  const notes = noteProp ? unescapeVCard(noteProp.value) : undefined;

  return {
    id: objUrl,
    uid,
    fullName,
    firstName,
    lastName,
    emails,
    phones,
    addresses,
    organization: organization || undefined,
    notes: notes || undefined,
    url: objUrl,
    etag,
  };
}

// ---------------------------------------------------------------------------
// vCard 3.0 generation
// ---------------------------------------------------------------------------

/** Escape a plain text vCard property value. */
function escVal(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Escape a single component within a structured property (ADR, N). */
function escComp(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,');
  // Do NOT escape ';' — the caller joins components with ';'
}

/** Fold a vCard line to max 75 octets per RFC 6350 §3.2. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    out += '\r\n ' + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return out;
}

function buildVCard(uid: string, c: NewContact): string {
  const firstName = c.firstName ?? '';
  const lastName = c.lastName ?? '';
  const fullName = c.fullName ?? [firstName, lastName].filter(Boolean).join(' ');

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${uid}`,
    `FN:${escVal(fullName)}`,
    `N:${escComp(lastName)};${escComp(firstName)};;;`,
  ];

  for (const email of c.emails ?? []) {
    lines.push(`EMAIL;TYPE=INTERNET:${escVal(email)}`);
  }

  for (const phone of c.phones ?? []) {
    lines.push(`TEL;TYPE=VOICE:${escVal(phone)}`);
  }

  for (const addr of c.addresses ?? []) {
    const adrParts = [
      '',
      '',
      escComp(addr.street ?? ''),
      escComp(addr.city ?? ''),
      escComp(addr.state ?? ''),
      escComp(addr.postalCode ?? ''),
      escComp(addr.country ?? ''),
    ];
    lines.push(`ADR;TYPE=${addr.type.toUpperCase()}:${adrParts.join(';')}`);
  }

  if (c.organization) lines.push(`ORG:${escVal(c.organization)}`);
  if (c.notes) lines.push(`NOTE:${escVal(c.notes)}`);

  lines.push('END:VCARD');
  return lines.map(foldLine).join('\r\n');
}

function buildUpdatedVCard(uid: string, existing: Contact, updates: ContactUpdates): string {
  return buildVCard(uid, {
    firstName: updates.firstName ?? existing.firstName,
    lastName: updates.lastName ?? existing.lastName,
    fullName: updates.fullName ?? existing.fullName,
    emails: updates.emails ?? existing.emails,
    phones: updates.phones ?? existing.phones,
    organization: updates.organization ?? existing.organization,
    notes: updates.notes ?? existing.notes,
    addresses: updates.addresses ?? existing.addresses,
  });
}

// ---------------------------------------------------------------------------
// Internal: find a vCard object by UID
// ---------------------------------------------------------------------------

async function findVCardByUid(
  client: DAVClient,
  uid: string,
): Promise<{ vcard: DAVVCard; contact: Contact }> {
  const all = await getAllVCards(client);
  for (const { vcard } of all) {
    if (!vcard.data) continue;
    const contact = parseVCard(String(vcard.data), vcard.url, vcard.etag);
    if (contact?.uid === uid) return { vcard, contact };
  }
  throw new Error(`Contact with UID "${uid}" not found`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List contacts with optional pagination.
 * Fetches all vCards from all address books, parses, and paginates in memory.
 */
export async function listContacts(
  limit?: number,
  offset?: number,
): Promise<PaginationResult<Contact>> {
  const client = await createClient();
  const all = await getAllVCards(client);

  const contacts: Contact[] = [];
  for (const { vcard } of all) {
    if (!vcard.data) continue;
    const c = parseVCard(String(vcard.data), vcard.url, vcard.etag);
    if (c) contacts.push(c);
  }

  // Sort alphabetically by full name for stable pagination
  contacts.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return paginate(contacts, { offset, limit });
}

/**
 * Search contacts by name, email address, or phone number.
 * Case-insensitive substring match across all fields.
 */
export async function searchContacts(query: string): Promise<Contact[]> {
  const client = await createClient();
  const all = await getAllVCards(client);
  const q = query.toLowerCase();

  const results: Contact[] = [];
  for (const { vcard } of all) {
    if (!vcard.data) continue;
    const c = parseVCard(String(vcard.data), vcard.url, vcard.etag);
    if (!c) continue;

    const matches =
      c.fullName.toLowerCase().includes(q) ||
      (c.firstName?.toLowerCase().includes(q) ?? false) ||
      (c.lastName?.toLowerCase().includes(q) ?? false) ||
      c.emails.some((e) => e.toLowerCase().includes(q)) ||
      c.phones.some((p) => p.toLowerCase().includes(q)) ||
      (c.organization?.toLowerCase().includes(q) ?? false);

    if (matches) results.push(c);
  }

  return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Fetch the full details of a contact by UID.
 */
export async function getContact(uid: string): Promise<Contact> {
  const client = await createClient();
  const { contact } = await findVCardByUid(client, uid);
  return contact;
}

/**
 * Create a new contact in the default address book.
 * Returns the generated UID.
 */
export async function createContact(contact: NewContact): Promise<string> {
  const client = await createClient();
  const book = await getDefaultAddressBook(client);
  const uid = randomUUID();
  const vCardString = buildVCard(uid, contact);
  await client.createVCard({
    addressBook: book,
    vCardString,
    filename: `${uid}.vcf`,
  });
  return uid;
}

/**
 * Update an existing contact by UID.
 * Fetches the current vCard, merges updates, and PUTs back using ETag.
 */
export async function updateContact(uid: string, updates: ContactUpdates): Promise<void> {
  const client = await createClient();
  const { vcard, contact } = await findVCardByUid(client, uid);
  const vCardString = buildUpdatedVCard(uid, contact, updates);
  await client.updateVCard({
    vCard: { url: vcard.url, etag: vcard.etag, data: vCardString },
  });
}
