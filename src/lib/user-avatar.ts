type UserLike = {
  user_metadata?: Record<string, unknown>;
};

export function getUserAvatarUrl(user: UserLike): string | null {
  const metadata = user.user_metadata;

  const custom =
    typeof metadata?.custom_avatar_url === "string" && metadata.custom_avatar_url.trim();
  if (custom) return custom;

  const fromProvider =
    (typeof metadata?.avatar_url === "string" && metadata.avatar_url.trim()) ||
    (typeof metadata?.picture === "string" && metadata.picture.trim());

  return fromProvider || null;
}
