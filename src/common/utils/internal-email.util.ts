const INTERNAL_EMAIL_DOMAINS = ['@thehereafter.tech', '@writersunblocked.studio'] as const;

export function isInternalEmail(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return INTERNAL_EMAIL_DOMAINS.some((domain) => normalizedEmail.endsWith(domain));
}
