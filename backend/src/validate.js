// Request validation. All request bodies are untrusted (NFR-07).

import { badRequest } from './errors.js';

export function text(value, field, { max = 200, required = true, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required && fallback === undefined) throw badRequest(`${field} is required.`);
    return fallback;
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`);
  // Strip control characters so names are safe to show and use in file names.
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!clean && required) throw badRequest(`${field} cannot be empty.`);
  if (clean.length > max) throw badRequest(`${field} must be at most ${max} characters.`);
  return clean;
}

export function oneOf(value, field, options, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!options.includes(value)) throw badRequest(`${field} must be one of: ${options.join(', ')}.`);
  return value;
}

export function number(value, field, { min = -Infinity, max = Infinity, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${field} must be a number between ${min} and ${max}.`);
  return n;
}

export function idList(value, field, { max = 50000 } = {}) {
  if (!Array.isArray(value) || !value.length) throw badRequest(`${field} must be a non-empty list.`);
  if (value.length > max) throw badRequest(`${field} has too many items.`);
  if (!value.every(v => typeof v === 'string' && /^[\w-]{1,64}$/.test(v))) throw badRequest(`${field} contains an invalid id.`);
  return value;
}

export function rangeList(value, field) {
  if (!Array.isArray(value) || !value.length || value.length > 10000) throw badRequest(`${field} must be a non-empty list of {start, end} ranges.`);
  return value.map(r => ({ start: Number(r?.start), end: Number(r?.end) }));
}

/** File-name-safe slug for exported deliverables. */
export function slug(name) {
  return (name || 'voxcut').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '').slice(0, 60) || 'voxcut';
}
