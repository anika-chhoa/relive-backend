
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const allowList = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowList.includes(email.toLowerCase());
}