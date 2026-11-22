export function isSafeJobId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id.trim());
}
