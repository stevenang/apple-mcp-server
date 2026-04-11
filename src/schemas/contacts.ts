import { z } from 'zod';

// Shared response_format field
const responseFormat = z
  .enum(['markdown', 'json'])
  .optional()
  .default('markdown')
  .describe("Response format: 'markdown' (default) or 'json'");

const addressSchema = z.object({
  type: z
    .string()
    .optional()
    .default('home')
    .describe('Address type: home, work, other'),
  street: z.string().optional().describe('Street address'),
  city: z.string().optional().describe('City'),
  state: z.string().optional().describe('State or province'),
  postalCode: z.string().optional().describe('Postal / ZIP code'),
  country: z.string().optional().describe('Country'),
});

/** apple_contacts_list */
export const contactsListSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe('Maximum contacts to return (1–200, default 50)'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe('Number of contacts to skip for pagination (default 0)'),
  response_format: responseFormat,
};

/** apple_contacts_search */
export const contactsSearchSchema = {
  query: z
    .string()
    .min(1)
    .describe('Search string matched against name, email, phone, and organization'),
  response_format: responseFormat,
};

/** apple_contacts_get */
export const contactsGetSchema = {
  uid: z
    .string()
    .min(1)
    .describe('Contact UID — obtained from apple_contacts_list or apple_contacts_search'),
  response_format: responseFormat,
};

/** apple_contacts_create */
export const contactsCreateSchema = {
  first_name: z.string().optional().describe('First name'),
  last_name: z.string().optional().describe('Last name'),
  full_name: z
    .string()
    .optional()
    .describe('Full display name. If omitted, derived from first_name + last_name.'),
  emails: z.array(z.string().email()).optional().describe('Email addresses'),
  phones: z.array(z.string()).optional().describe('Phone numbers'),
  organization: z.string().optional().describe('Company or organization name'),
  notes: z.string().optional().describe('Notes'),
  addresses: z.array(addressSchema).optional().describe('Postal addresses'),
  response_format: responseFormat,
};

/** apple_contacts_update */
export const contactsUpdateSchema = {
  uid: z
    .string()
    .min(1)
    .describe('Contact UID — obtained from apple_contacts_list or apple_contacts_search'),
  first_name: z.string().optional().describe('New first name'),
  last_name: z.string().optional().describe('New last name'),
  full_name: z.string().optional().describe('New full display name'),
  emails: z.array(z.string().email()).optional().describe('Replacement email addresses'),
  phones: z.array(z.string()).optional().describe('Replacement phone numbers'),
  organization: z.string().optional().describe('New organization name'),
  notes: z.string().optional().describe('New notes'),
  addresses: z.array(addressSchema).optional().describe('Replacement postal addresses'),
  response_format: responseFormat,
};
