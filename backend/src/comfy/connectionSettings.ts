import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from '../config.js';

interface StoredConnectionSettings {
  baseUrl?: unknown;
}

const connectionSettingsPath = appConfig.comfyUi.connectionSettingsPath;

let currentBaseUrl = loadInitialBaseUrl();

function loadInitialBaseUrl(): string {
  const fallback = normalizeComfyBaseUrl(appConfig.comfyUi.baseUrl);

  try {
    const raw = fs.readFileSync(connectionSettingsPath, 'utf8');
    const parsed = JSON.parse(raw) as StoredConnectionSettings;
    return normalizeComfyBaseUrl(typeof parsed.baseUrl === 'string' ? parsed.baseUrl : fallback);
  } catch {
    return fallback;
  }
}

function persistConnectionSettings(baseUrl: string): void {
  fs.mkdirSync(path.dirname(connectionSettingsPath), { recursive: true });
  fs.writeFileSync(connectionSettingsPath, JSON.stringify({ baseUrl }, null, 2), 'utf8');
}

export function normalizeComfyBaseUrl(value: string): string {
  const rawValue = value.trim();
  if (!rawValue) {
    throw new Error('ComfyUI API address is required.');
  }

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `http://${rawValue}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(withProtocol);
  } catch {
    throw new Error('ComfyUI API address must be a valid http:// or https:// URL.');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('ComfyUI API address must use http:// or https://.');
  }

  parsedUrl.hash = '';
  parsedUrl.search = '';

  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '');
  return `${parsedUrl.protocol}//${parsedUrl.host}${normalizedPath === '/' ? '' : normalizedPath}`;
}

export function getComfyBaseUrl(): string {
  return currentBaseUrl;
}

export function setComfyBaseUrl(baseUrl: string, options?: { persist?: boolean }): string {
  const normalized = normalizeComfyBaseUrl(baseUrl);
  currentBaseUrl = normalized;

  if (options?.persist !== false) {
    persistConnectionSettings(normalized);
  }

  return normalized;
}
