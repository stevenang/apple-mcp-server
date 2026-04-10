/**
 * Centralized configuration module.
 *
 * This is the ONLY file in the project that reads process.env.
 * All other modules import credentials from here.
 *
 * Loads .env file via dotenv on import. If required keys are
 * missing, throws immediately with setup instructions.
 */

import dotenv from 'dotenv';

// Load .env file from project root
dotenv.config();

/**
 * Read a required environment variable or throw with a helpful message.
 */
function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `\nMissing required environment variable: ${key}\n\n` +
      `Setup instructions:\n` +
      `  1. cp .env.example .env\n` +
      `  2. Open .env and fill in your credentials\n` +
      `  3. Generate an app-specific password at:\n` +
      `     https://appleid.apple.com → Sign-In and Security → App-Specific Passwords\n\n` +
      `See README.md for detailed setup instructions.\n`
    );
  }
  return value;
}

/**
 * Validated application configuration.
 * Throws at startup if any required values are missing.
 */
export const config = {
  icloud: {
    email: requireEnv('ICLOUD_EMAIL'),
    appPassword: requireEnv('ICLOUD_APP_PASSWORD'),
  },

  /** Apple service endpoints (rarely change, but centralized here) */
  endpoints: {
    imap: {
      host: 'imap.mail.me.com',
      port: 993,
      secure: true,
    },
    smtp: {
      host: 'smtp.mail.me.com',
      port: 587,
      secure: false, // STARTTLS upgrades after connect
    },
    caldav: 'https://caldav.icloud.com/',
    carddav: 'https://contacts.icloud.com/',
  },
} as const;

/** TypeScript type for the config object */
export type AppConfig = typeof config;
