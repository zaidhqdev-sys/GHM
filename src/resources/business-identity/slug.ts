export const createBusinessSlug = (name: string): string => {
  const normalized = name.trim().toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'business';
};
