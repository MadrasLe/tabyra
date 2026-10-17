export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (value === 'about:blank') return value;
  if (!value) throw new Error('Informe um endereço.');
  const candidate = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value)
    ? `http://${value}` : /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use um endereço http:// ou https://.');
  if (url.username || url.password) throw new Error('Endereços com credenciais não são aceitos.');
  return url.href;
}
