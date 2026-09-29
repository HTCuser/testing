// Người đang đăng nhập và quyền của họ. Nút nào cần quyền thì gắn
// data-perm="..." — CSS tự ẩn khi body không có lớp can-<quyền>. Máy chủ vẫn
// kiểm quyền ở mọi yêu cầu; ẩn nút chỉ để người dùng khỏi bấm vào chỗ bị cấm.

const state = { user: null, roles: {}, permLabels: {}, rolePerms: {} };

export function setSession({ user, roles = {}, perm_labels: permLabels = {}, role_perms: rolePerms = {} }) {
  Object.assign(state, { user, roles, permLabels, rolePerms });
  const body = document.body;
  [...body.classList].filter((c) => c.startsWith('can-')).forEach((c) => body.classList.remove(c));
  (user?.perms || []).forEach((p) => body.classList.add(`can-${p}`));
}

export function currentUser() { return state.user; }
export function can(perm) { return Boolean(state.user?.perms?.includes(perm)); }
export function roles() { return state.roles; }
export function permLabels() { return state.permLabels; }
export function rolePerms() { return state.rolePerms; }

export function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  // Tên người Việt: lấy chữ đầu của họ và của tên (Hà Duy Tuấn -> HT).
  const pick = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  return pick.map((w) => w[0]).join('').toUpperCase();
}
