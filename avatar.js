const AVATAR_COLORS = ["#0000ff", "#5b3df5", "#2e7dff", "#0047ab", "#3a86ff", "#5c4dff"];

export function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitial(name) {
  return name.trim().charAt(0).toUpperCase() || "?";
}
