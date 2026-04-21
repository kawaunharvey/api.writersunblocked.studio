import { createHash } from 'crypto'

export function normalizeBlockContentForHash(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

export function hashBlockContent(content: string): string {
  return createHash('md5').update(normalizeBlockContentForHash(content)).digest('hex');
}
