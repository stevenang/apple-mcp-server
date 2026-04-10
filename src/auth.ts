import { config } from './config.js';

export function getImapAuth() {
  return {
    user: config.icloud.email,
    pass: config.icloud.appPassword,
  };
}

export function getSmtpAuth() {
  return {
    user: config.icloud.email,
    pass: config.icloud.appPassword,
  };
}

export function getCalDavAuth() {
  return {
    username: config.icloud.email,
    password: config.icloud.appPassword,
  };
}

export function getCardDavAuth() {
  return {
    username: config.icloud.email,
    password: config.icloud.appPassword,
  };
}
