import { config } from './config.js';

/** Auth object for imapflow ImapFlow constructor (`auth` field). */
export function getImapAuth() {
  return {
    user: config.icloud.email,
    pass: config.icloud.appPassword,
  };
}

/** Auth object for nodemailer SMTP transport (`auth` field). */
export function getSmtpAuth() {
  return {
    user: config.icloud.email,
    pass: config.icloud.appPassword,
  };
}

/**
 * Credentials for tsdav DAVClient targeting iCloud CalDAV.
 * iCloud requires basic auth — do NOT use digest auth.
 */
export function getCalDavCredentials() {
  return {
    username: config.icloud.email,
    password: config.icloud.appPassword,
  };
}

/**
 * Credentials for tsdav DAVClient targeting iCloud CardDAV.
 * iCloud requires basic auth — do NOT use digest auth.
 */
export function getCardDavCredentials() {
  return {
    username: config.icloud.email,
    password: config.icloud.appPassword,
  };
}

/** Convenience accessor for the iCloud email address (used as IMAP username). */
export function getEmail(): string {
  return config.icloud.email;
}
