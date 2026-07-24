import { createCallDoc, listenForIncomingCalls, listenForCall, declineCallDoc, endCallDoc, setCallAnswer, getActiveCallForFriendship, CallSession } from './calls.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut, updateEmail, updatePassword, deleteUser, reauthenticateWithCredential, EmailAuthProvider } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, increment, serverTimestamp, collection, query, where, getDocs, limit } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { getAvatarColor, getInitial } from './avatar.js';
import { sendFriendRequest, listenForIncomingRequests, acceptFriendRequest, declineFriendRequest, listenForFriends, friendshipId, unfriendUser, blockUser, unblockUser, listenForBlockedUsers } from './friends.js';
import { listenForMessages, sendMessage, toggleReaction, toggleSuperReaction, markAsRead, deleteMessage, setTyping, listenForTyping } from './messages.js';
import { searchGifs } from './giphy.js';
import { createServer, joinServerByCode, listenForMyServers, listenForJoinRequests, approveJoinRequest, declineJoinRequest, listenForChannels, updateChannel, deleteChannelDoc, createChannel, updateServerSettings, markChannelRead, clearServerMentions, deleteServerEntirely, leaveServer, setCustomJoinCode, createCategory, deleteCategory, createRole, deleteRole, assignMemberRole, timeoutMember, removeTimeout, setJoinableTags, setMemberTags, applyLiftToServer } from './servers.js';
import { uploadProfileImage } from './cloudinary.js';
import { listenForShopItems, createShopItem, updateShopItem, deleteShopItem, toggleWishlist, buyShopItem, equipCosmetic } from './shop.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let myUid = null;
let myUsername = null;
let myProfile = {};
let myFriends = [];
let myBlockedUsers = [];
let myServers = [];
let myShopItems = [];
let currentChat = null;
let currentServer = null;
let editingChannel = null;
let selectedShopItem = null;
let editingShopItemId = null;
let pendingJoinServerId = null;
let currentMessagesUnsubscribe = null;
let currentChannelsUnsubscribe = null;
let currentJoinRequestsUnsubscribe = null;
let currentTypingUnsubscribe = null;
let replyingTo = null;
let gifSearchTimeout = null;
let selectedServerBannerColor = null;
let selectedProfileBannerColor = null;
let selectedRoleColor = null;
let previousMentions = {};
let mentionsInitialized = false;
let typingThrottle = 0;
let editingServerIconUrl = null;
let newItemImageUrl = null;
const userExtraCache = {};

const EMOJI_LIST = ["😀","😂","😍","😎","🥳","😢","😡","👍","👎","❤️","🔥","🎉","💀","😭","🙏","👀","😅","🤔","😴","🤯","💯","✨","🫡","😤"];
const QUICK_REACTIONS = ["👍","❤️","😂","😮","😢","🔥"];
const BANNER_COLORS = ["#0000ff", "#5b3df5", "#2e7dff", "#ef4444", "#f59e0b", "#4ade80", "#ec4899", "#14b8a6"];

const BADGE_COLORS = { leaf: "#4ade80", hammer: "#ef4444", gifter: "#f59e0b", turboBasic: "#ec4899", turboPremium: "#8b5cf6" };

const ICONS = {
  smile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
  addReaction: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
  reply: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`,
  gear: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  share: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`,
  lock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
  power: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  exit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`,
  call: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
  people: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
  gem: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9Z"></path><path d="M2 9h20"></path><path d="M9 3 8 9l4 12 4-12-1-6"></path></svg>`,
  gemSmall: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9Z"></path><path d="M2 9h20"></path><path d="M9 3 8 9l4 12 4-12-1-6"></path></svg>`,
  folder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  play: `<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`,
  star: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  leaf: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>`,
  hammer: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9"></path><path d="M17.64 15 22 10.64"></path><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"></path></svg>`,
  gift: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>`,
  sparkle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"></path></svg>`,
  edit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`
};

const BADGE_ICONS = {
  leaf: ICONS.leaf,
  hammer: ICONS.hammer,
  gifter: ICONS.gift,
  turboBasic: ICONS.sparkle,
  turboPremium: ICONS.gemSmall
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderTextWithMentions(text) {
  return escapeHtml(text).replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return timestamp.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const then = timestamp.toDate();
  const now = new Date();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getJoinLinkForCode(code) {
  return `${window.location.origin}${window.location.pathname}?join=${code}`;
}

function randomBannerColor() {
  return BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)];
}

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function setIcon(id, svg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = svg;
}

function applyStaticIcons() {
  setIcon("rail-home-btn", ICONS.people);
  setIcon("server-invite-btn", ICONS.share);
  setIcon("server-settings-btn", ICONS.gear);
  setIcon("server-leave-btn", ICONS.exit);
  setIcon("my-profile-settings-btn", ICONS.gear);
  setIcon("logout-btn", ICONS.power);
  setIcon("add-category-btn", ICONS.folder);
}
applyStaticIcons();

function memberHasPerm(server, uid, permName) {
  if (!server) return false;
  const roleId = (server.memberRoles || {})[uid];
  if (!roleId) return false;
  const role = (server.roles || {})[roleId];
  return !!(role && role.perms && role.perms[permName]);
}

function getRoleColorForMember(uid) {
  if (!currentServer) return null;
  const roleId = (currentServer.memberRoles || {})[uid];
  if (!roleId) return null;
  const role = (currentServer.roles || {})[roleId];
  return role ? role.color : null;
}

function hasSuperReact() {
  return myProfile.turboTier === "basic" || myProfile.turboTier === "premium";
}

function isAdminUser() {
  return (myProfile.badges || []).includes("hammer");
}

function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function renderAvatarEffect(imgEl, itemId) {
  if (!imgEl) return;
  const item = itemId ? myShopItems.find((i) => i.id === itemId) : null;
  if (item) {
    const size = item.effectScale || 100;
    imgEl.src = item.imageUrl;
    imgEl.style.width = `${size}%`;
    imgEl.style.height = `${size}%`;
    imgEl.style.display = "block";
  } else {
    imgEl.style.display = "none";
    imgEl.removeAttribute("src");
  }
}

function renderMyAvatar() {
  const el = document.getElementById("my-avatar");
  if (myProfile.pfpUrl) {
    el.style.backgroundImage = `url(${myProfile.pfpUrl})`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.textContent = "";
  } else {
    el.style.backgroundImage = "none";
    el.style.backgroundColor = getAvatarColor(myUsername);
    el.textContent = getInitial(myUsername);
  }
  renderAvatarEffect(document.getElementById("my-avatar-effect"), myProfile.equippedEffect);
}

function renderMyBadgeRow() {
  const el = document.getElementById("my-badge-row");
  if (el) el.innerHTML = myProfile.equippedTag ? renderEquippedTagHtml(myProfile.equippedTag) : "";
}

function renderPfpPreview() {
  const el = document.getElementById("pfp-preview");
  if (!el) return;
  if (myProfile.pfpUrl) {
    el.style.backgroundImage = `url(${myProfile.pfpUrl})`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.textContent = "";
  } else {
    el.style.backgroundImage = "none";
    el.style.backgroundColor = getAvatarColor(myUsername);
    el.textContent = getInitial(myUsername);
  }
}

function renderBadgesHtml(badges) {
  if (!badges || badges.length === 0) return "";
  return badges.map((b) => `<span class="badge-icon" style="color:${BADGE_COLORS[b] || "#8a8fa3"}" title="${b}">${BADGE_ICONS[b] || ""}</span>`).join("");
}

function renderEquippedTagHtml(tag) {
  if (!tag || !tag.serverId) return "";
  return `<span class="equipped-tag" data-server-id="${tag.serverId}" data-join-code="${tag.joinCode || ""}" title="Click to join">${escapeHtml(tag.tagEmoji || "")}${escapeHtml(tag.tagWord || "")}</span>`;
}

async function getCachedUserExtra(uid) {
  if (uid === myUid) return { pfpUrl: myProfile.pfpUrl || null, badges: myProfile.badges || [], equippedTag: myProfile.equippedTag || null };
  if (uid in userExtraCache) return userExtraCache[uid];
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const d = snap.exists() ? snap.data() : {};
    userExtraCache[uid] = { pfpUrl: d.pfpUrl || null, badges: d.badges || [], equippedTag: d.equippedTag || null };
  } catch (err) {
    userExtraCache[uid] = { pfpUrl: null, badges: [], equippedTag: null };
  }
  return userExtraCache[uid];
}

function applyAvatarImage(el, uid) {
  if (!el || !uid) return;
  getCachedUserExtra(uid).then((extra) => {
    if (extra.pfpUrl) {
      el.style.backgroundImage = `url(${extra.pfpUrl})`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.textContent = "";
    }
  });
}

function applyEquippedTagOnly(el, uid) {
  if (!el || !uid) return;
  getCachedUserExtra(uid).then((extra) => {
    el.innerHTML = renderEquippedTagHtml(extra.equippedTag);
    el.querySelectorAll(".equipped-tag").forEach((tagEl) => {
      tagEl.addEventListener("click", (e) => {
        e.stopPropagation();
        handleTagClick(tagEl.dataset.serverId, tagEl.dataset.joinCode);
      });
    });
  });
}

async function handleTagClick(serverId, joinCode) {
  if (currentServer && currentServer.id === serverId) return;
  if (myServers.some((s) => s.id === serverId)) {
    showToast("You're already in this server.");
    return;
  }
  if (!confirm("Join this server?")) return;
  try {
    const result = await joinServerByCode(db, myUid, myUsername, joinCode);
    showToast(result.requested ? "Join request sent!" : `Joined "${result.serverName}"!`);
    maybeShowJoinTagsModal(result);
  } catch (err) {
    alert(err.message);
  }
}

function isBlocked(uid) {
  return myBlockedUsers.some((b) => b.blockedUid === uid);
}

function renderBlockedUsersList() {
  const list = document.getElementById("blocked-users-list");
  if (!list) return;
  list.innerHTML = "";
  if (myBlockedUsers.length === 0) {
    list.innerHTML = `<p class="empty-sub">No blocked users.</p>`;
    return;
  }
  myBlockedUsers.forEach((b) => {
    const item = document.createElement("div");
    item.className = "friend-item";
    item.innerHTML = `
      <div class="avatar-circle small-avatar" style="background-color:${getAvatarColor(b.blockedUsername)}">${getInitial(b.blockedUsername)}</div>
      <div class="friend-info"><span class="friend-name">${escapeHtml(b.blockedUsername)}</span></div>
      <button class="invite-send-btn">Unblock</button>
    `;
    item.querySelector("button").addEventListener("click", async () => {
      await unblockUser(db, myUid, b.blockedUid);
    });
    list.appendChild(item);
  });
}

function canWatchAdToday() {
  if (!myProfile.lastAdWatch) return true;
  const last = myProfile.lastAdWatch.toDate ? myProfile.lastAdWatch.toDate() : new Date(myProfile.lastAdWatch);
  return last.toDateString() !== new Date().toDateString();
}

function renderTypingIndicator(typingMap) {
  const el = document.getElementById("typing-indicator");
  if (!el) return;
  const now = Date.now();
  const names = Object.entries(typingMap || {})
    .filter(([uid, info]) => uid !== myUid && info && info.at && (now - info.at.toMillis()) < 6000)
    .map(([, info]) => info.username);

  if (names.length === 0) {
    el.textContent = "";
    el.style.display = "none";
  } else if (names.length === 1) {
    el.textContent = `${names[0]} is typing...`;
    el.style.display = "block";
  } else {
    el.textContent = `${names.join(", ")} are typing...`;
    el.style.display = "block";
  }
}

// ---------- Join-time tags modal ----------

function maybeShowJoinTagsModal(result) {
  if (!result || result.requested || !result.joinableTags || result.joinableTags.length === 0) return;
  pendingJoinServerId = result.serverId;
  const list = document.getElementById("join-tags-list");
  list.innerHTML = result.joinableTags.map((tag) => `
    <label class="toggle-row"><input type="checkbox" class="join-tag-checkbox" value="${escapeHtml(tag)}"> ${escapeHtml(tag)}</label>
  `).join("");
  document.getElementById("join-tags-modal-backdrop").style.display = "flex";
}

on("close-join-tags-modal-btn", "click", () => {
  document.getElementById("join-tags-modal-backdrop").style.display = "none";
});

on("save-join-tags-btn", "click", async () => {
  if (!pendingJoinServerId) return;
  const selected = [...document.querySelectorAll(".join-tag-checkbox:checked")].map((cb) => cb.value);
  try {
    await setMemberTags(db, pendingJoinServerId, myUid, selected);
  } catch (err) {
    alert(err.message);
  }
  document.getElementById("join-tags-modal-backdrop").style.display = "none";
  pendingJoinServerId = null;
});

// ---------- Sidebar nav ----------

function switchSidebarNav(target) {
  document.querySelectorAll(".sidebar-nav-btn").forEach((b) => b.classList.remove("active"));
  const btn = document.querySelector(`.sidebar-nav-btn[data-nav="${target}"]`);
  if (btn) btn.classList.add("active");

  document.getElementById("friends-view").style.display = target === "friends" ? "block" : "none";
  document.getElementById("quests-nav-view").style.display = target === "quests" ? "block" : "none";
  document.getElementById("shop-nav-view").style.display = target === "shop" ? "block" : "none";
  document.getElementById("discover-nav-view").style.display = target === "discover" ? "block" : "none";
  document.getElementById("server-view").style.display = "none";
  currentServer = null;
  if (currentChannelsUnsubscribe) { currentChannelsUnsubscribe(); currentChannelsUnsubscribe = null; }
  if (currentJoinRequestsUnsubscribe) { currentJoinRequestsUnsubscribe(); currentJoinRequestsUnsubscribe = null; }
  if (currentMessagesUnsubscribe) { currentMessagesUnsubscribe(); currentMessagesUnsubscribe = null; }
  if (currentTypingUnsubscribe) { currentTypingUnsubscribe(); currentTypingUnsubscribe = null; }
  currentChat = null;

  if (target === "friends") {
    document.getElementById("main-area").innerHTML = `
      <div class="empty-main">
        <div class="empty-logo">Larpcord</div>
        <p>Add friends to start chatting</p>
      </div>
    `;
  } else if (target === "quests") {
    renderQuestsMain();
  } else if (target === "shop") {
    renderShopMain();
  } else if (target === "discover") {
    renderDiscoverMain();
  }
}

on("rail-home-btn", "click", () => switchSidebarNav("friends"));
on("nav-quests-btn", "click", () => switchSidebarNav("quests"));
on("nav-shop-btn", "click", () => switchSidebarNav("shop"));
on("nav-discover-btn", "click", () => switchSidebarNav("discover"));

function renderQuestsMain() {
  const canWatch = canWatchAdToday();
  document.getElementById("main-area").innerHTML = `
    <div class="quests-hero-wrap">
      <div class="quests-hero-card">
        <div class="quest-hero-icon">${ICONS.play}</div>
        <div class="quest-hero-title">Watch Advertisement</div>
        <div class="quest-hero-reward-badge">+50 Credits</div>
        <p class="quest-hero-desc">Support the development of LarpCord by watching a short advertisement.</p>
        <button id="watch-ad-btn" type="button" class="quest-hero-btn" ${canWatch ? "" : "disabled"}>${canWatch ? "Watch Ad" : "Come back tomorrow"}</button>
      </div>
      <div class="credits-display">
        <span class="credits-amount">${myProfile.credits || 0}</span>
        <span class="credits-label">Your Credits</span>
      </div>
    </div>
  `;
  on("watch-ad-btn", "click", handleWatchAd);
}

function handleWatchAd() {
  if (!canWatchAdToday()) return;
  const overlay = document.getElementById("quest-ad-overlay");
  const adContent = document.getElementById("quest-ad-content");
  const completeContent = document.getElementById("quest-complete-content");
  adContent.style.display = "flex";
  completeContent.style.display = "none";
  overlay.style.display = "flex";

  const fill = document.getElementById("quest-ad-progress-fill");
  fill.style.transition = "none";
  fill.style.width = "0%";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.transition = "width 5s linear";
      fill.style.width = "100%";
    });
  });

  setTimeout(() => {
    adContent.style.display = "none";
    completeContent.style.display = "flex";
    completeContent.classList.remove("quest-complete-pop");
    void completeContent.offsetWidth;
    completeContent.classList.add("quest-complete-pop");
  }, 5000);
}

on("collect-reward-btn", "click", async () => {
  const overlay = document.getElementById("quest-ad-overlay");
  const btn = document.getElementById("collect-reward-btn");
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "users", myUid), { credits: increment(50), lastAdWatch: serverTimestamp() });
    myProfile = { ...myProfile, credits: (myProfile.credits || 0) + 50, lastAdWatch: { toDate: () => new Date() } };
    showToast("+50 Credits!");
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    overlay.style.display = "none";
    renderQuestsMain();
  }
});

// ---------- Shop ----------

function renderShopMain() {
  const isAdmin = isAdminUser();
  const tier = myProfile.turboTier || null;

  const itemsHtml = myShopItems.length === 0
    ? `<p class="empty-sub">No items yet.</p>`
    : myShopItems.map((item) => `
      <div class="shop-item-mini" data-item-id="${item.id}">
        ${isAdmin ? `<button class="shop-item-edit-btn" data-item-id="${item.id}">${ICONS.edit}</button>` : ""}
        <img src="${item.imageUrl}" class="shop-item-mini-img">
        <div class="shop-item-mini-name">${escapeHtml(item.name)}</div>
        <div class="shop-item-mini-price">${item.price} Credits</div>
      </div>
    `).join("");

  document.getElementById("main-area").innerHTML = `
    <div class="shop-main">
      <div class="empty-logo" style="font-size:24px; margin-bottom: 10px;">Shop</div>

      <div class="section-label-row">
        <div class="section-label">Cosmetics</div>
        ${isAdmin ? `<button class="add-channel-btn" id="open-add-shop-item-btn" title="Add item">+</button>` : ""}
      </div>
      <div class="shop-items-row">${itemsHtml}</div>

      <div class="turbo-hero-card">
        <div class="turbo-hero-icon">${ICONS.gem}</div>
        <div class="turbo-hero-title">TURBO</div>
        <p class="turbo-hero-desc">Unlock premium cosmetics and features. Bought with Credits, no real money involved.</p>

        <div class="turbo-tier-card">
          <div class="turbo-tier-header">
            <span class="turbo-tier-icon">${ICONS.sparkle}</span>
            <span class="turbo-tier-name">TURBO BASIC</span>
          </div>
          <ul class="turbo-perks-list">
            <li>Super Reactions</li>
            <li>Turbo badge on your profile</li>
          </ul>
          <div class="turbo-price-squares">
            <button class="turbo-square turbo-square-monthly" id="buy-basic-monthly-btn" ${tier ? "disabled" : ""}>
              <span class="turbo-square-label">Monthly</span>
              <span class="turbo-square-price">100</span>
            </button>
            <button class="turbo-square turbo-square-annual" id="buy-basic-annual-btn" ${tier ? "disabled" : ""}>
              <span class="turbo-square-label">Annual</span>
              <span class="turbo-square-price">1,000</span>
            </button>
          </div>
          ${tier === "basic" ? `<p class="settings-note" style="text-align:center;">Owned</p>` : (tier === "premium" ? `<p class="settings-note" style="text-align:center;">Included in Turbo</p>` : "")}
        </div>

        <div class="turbo-tier-card turbo-tier-premium">
          <div class="turbo-tier-header">
            <span class="turbo-tier-icon">${ICONS.gemSmall}</span>
            <span class="turbo-tier-name">TURBO</span>
          </div>
          <ul class="turbo-perks-list">
            <li>Everything in Turbo Basic</li>
            <li>3 Lifts for a server of your choice</li>
            <li>Premium badge</li>
          </ul>
          <div class="turbo-price-squares">
            <button class="turbo-square turbo-square-monthly" id="buy-premium-monthly-btn" ${tier === "premium" ? "disabled" : ""}>
              <span class="turbo-square-label">Monthly</span>
              <span class="turbo-square-price">300</span>
            </button>
            <button class="turbo-square turbo-square-annual" id="buy-premium-annual-btn" ${tier === "premium" ? "disabled" : ""}>
              <span class="turbo-square-label">Annual</span>
              <span class="turbo-square-price">3,000</span>
            </button>
          </div>
          ${tier === "premium" ? `<p class="settings-note" style="text-align:center;">Owned</p>` : ""}
        </div>
      </div>
      <p class="settings-note" style="text-align:center;">Annual is billed once as a lump sum — no recurring billing exists yet, so this is a one-time purchase for now.</p>
    </div>
  `;

  document.querySelectorAll(".shop-item-mini").forEach((el) => {
    el.addEventListener("click", () => openShopItemModal(el.dataset.itemId));
  });
  document.querySelectorAll(".shop-item-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditShopItemModal(btn.dataset.itemId);
    });
  });
  on("open-add-shop-item-btn", "click", openAddShopItemModal);
  on("buy-basic-monthly-btn", "click", () => buyTurbo("basic", 100));
  on("buy-basic-annual-btn", "click", () => buyTurbo("basic", 1000));
  on("buy-premium-monthly-btn", "click", () => buyTurbo("premium", 300));
  on("buy-premium-annual-btn", "click", () => buyTurbo("premium", 3000));
}

function openShopItemModal(itemId) {
  const item = myShopItems.find((i) => i.id === itemId);
  if (!item) return;
  selectedShopItem = item;
  document.getElementById("shop-item-modal-image").style.backgroundImage = `url(${item.imageUrl})`;
  document.getElementById("shop-item-modal-name").textContent = item.name;
  document.getElementById("shop-item-modal-price").textContent = `${item.price} Credits`;
  document.getElementById("shop-item-modal-desc").textContent = item.description;
  document.getElementById("shop-item-modal-message").textContent = "";

  const owned = (myProfile.ownedCosmetics || []).includes(item.id);
  const wishlisted = (myProfile.wishlist || []).includes(item.id);
  const buyBtn = document.getElementById("shop-item-buy-btn");
  const wishBtn = document.getElementById("shop-item-wishlist-btn");
  buyBtn.textContent = owned ? "Owned" : "Buy";
  buyBtn.disabled = owned;
  wishBtn.style.display = owned ? "none" : "inline-block";
  wishBtn.textContent = wishlisted ? "Remove from Wishlist" : "Add to Wishlist";

  document.getElementById("shop-item-modal-backdrop").style.display = "flex";
}

on("close-shop-item-modal-btn", "click", () => {
  document.getElementById("shop-item-modal-backdrop").style.display = "none";
});

on("shop-item-wishlist-btn", "click", async () => {
  if (!selectedShopItem) return;
  const wishlisted = (myProfile.wishlist || []).includes(selectedShopItem.id);
  try {
    await toggleWishlist(db, myUid, selectedShopItem.id, !wishlisted);
    myProfile = { ...myProfile, wishlist: wishlisted ? (myProfile.wishlist || []).filter((id) => id !== selectedShopItem.id) : [...(myProfile.wishlist || []), selectedShopItem.id] };
    openShopItemModal(selectedShopItem.id);
  } catch (err) {
    alert(err.message);
  }
});

on("shop-item-buy-btn", "click", async () => {
  if (!selectedShopItem) return;
  const msg = document.getElementById("shop-item-modal-message");
  try {
    await buyShopItem(db, myUid, selectedShopItem.id, selectedShopItem.price, myProfile.credits || 0);
    myProfile = {
      ...myProfile,
      credits: (myProfile.credits || 0) - selectedShopItem.price,
      ownedCosmetics: [...(myProfile.ownedCosmetics || []), selectedShopItem.id],
      wishlist: (myProfile.wishlist || []).filter((id) => id !== selectedShopItem.id)
    };
    msg.textContent = "Purchased!";
    msg.style.color = "#4ade80";
    openShopItemModal(selectedShopItem.id);
    showToast(`${selectedShopItem.name} added to your collection!`);
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  }
});

function resetAddItemFormUI() {
  document.getElementById("new-item-name").value = "";
  document.getElementById("new-item-description").value = "";
  document.getElementById("new-item-price").value = "";
  document.getElementById("new-item-image-input").value = "";
  document.getElementById("add-shop-item-message").textContent = "";
  document.getElementById("new-item-scale-slider").value = 100;
  document.getElementById("new-item-scale-label").textContent = "Size: 100%";
  document.getElementById("new-item-preview-img").style.display = "none";
}

function openAddShopItemModal() {
  editingShopItemId = null;
  newItemImageUrl = null;
  resetAddItemFormUI();
  document.getElementById("add-shop-item-title").textContent = "Add Shop Item";
  document.getElementById("create-shop-item-btn").textContent = "Add Item";
  document.getElementById("edit-item-delete-row").style.display = "none";
  document.getElementById("add-shop-item-modal-backdrop").style.display = "flex";
}

function openEditShopItemModal(itemId) {
  const item = myShopItems.find((i) => i.id === itemId);
  if (!item) return;
  editingShopItemId = itemId;
  newItemImageUrl = item.imageUrl;
  resetAddItemFormUI();
  document.getElementById("new-item-name").value = item.name;
  document.getElementById("new-item-description").value = item.description;
  document.getElementById("new-item-price").value = item.price;
  document.getElementById("new-item-scale-slider").value = item.effectScale || 100;
  document.getElementById("new-item-scale-label").textContent = `Size: ${item.effectScale || 100}%`;
  const previewImg = document.getElementById("new-item-preview-img");
  previewImg.src = item.imageUrl;
  previewImg.style.display = "block";
  previewImg.style.width = `${item.effectScale || 100}%`;
  previewImg.style.height = `${item.effectScale || 100}%`;
  document.getElementById("add-shop-item-title").textContent = "Edit Shop Item";
  document.getElementById("create-shop-item-btn").textContent = "Save Changes";
  document.getElementById("edit-item-delete-row").style.display = "flex";
  document.getElementById("add-shop-item-modal-backdrop").style.display = "flex";
}

on("close-add-shop-item-modal-btn", "click", () => {
  document.getElementById("add-shop-item-modal-backdrop").style.display = "none";
});

on("new-item-image-input", "change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const msg = document.getElementById("add-shop-item-message");
  msg.textContent = "Uploading...";
  msg.style.color = "#8a8fa3";
  try {
    newItemImageUrl = await uploadProfileImage(file);
    const previewImg = document.getElementById("new-item-preview-img");
    previewImg.src = newItemImageUrl;
    previewImg.style.display = "block";
    const scale = document.getElementById("new-item-scale-slider").value;
    previewImg.style.width = `${scale}%`;
    previewImg.style.height = `${scale}%`;
    msg.textContent = "Uploaded! Drag the slider to size it.";
    msg.style.color = "#4ade80";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  }
});

on("new-item-scale-slider", "input", (e) => {
  const size = e.target.value;
  document.getElementById("new-item-scale-label").textContent = `Size: ${size}%`;
  const previewImg = document.getElementById("new-item-preview-img");
  previewImg.style.width = `${size}%`;
  previewImg.style.height = `${size}%`;
});

on("create-shop-item-btn", "click", async () => {
  const name = document.getElementById("new-item-name").value.trim();
  const description = document.getElementById("new-item-description").value.trim();
  const price = parseInt(document.getElementById("new-item-price").value, 10) || 0;
  const scale = parseInt(document.getElementById("new-item-scale-slider").value, 10) || 100;
  const msg = document.getElementById("add-shop-item-message");
  if (!name || !newItemImageUrl) {
    msg.textContent = "Enter a name and upload an image/webp file first.";
    msg.style.color = "#f87171";
    return;
  }
  const btn = document.getElementById("create-shop-item-btn");
  btn.disabled = true;
  msg.textContent = "Saving...";
  msg.style.color = "#8a8fa3";
  try {
    if (editingShopItemId) {
      await updateShopItem(db, editingShopItemId, { name, description, price, imageUrl: newItemImageUrl, effectScale: scale });
      msg.textContent = "Item updated!";
    } else {
      await createShopItem(db, name, description, price, newItemImageUrl, scale);
      msg.textContent = "Item added!";
    }
    msg.style.color = "#4ade80";
    setTimeout(() => {
      document.getElementById("add-shop-item-modal-backdrop").style.display = "none";
    }, 600);
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    btn.disabled = false;
  }
});

on("delete-shop-item-btn", "click", async () => {
  if (!editingShopItemId) return;
  if (!confirm("Delete this shop item permanently?")) return;
  try {
    await deleteShopItem(db, editingShopItemId);
    document.getElementById("add-shop-item-modal-backdrop").style.display = "none";
    showToast("Item deleted.");
  } catch (err) {
    alert(err.message);
  }
});

async function buyTurbo(tier, cost) {
  if (myProfile.turboTier === "premium" || myProfile.turboTier === tier) {
    showToast("You already have this.");
    return;
  }
  if ((myProfile.credits || 0) < cost) {
    showToast("Not enough Credits.");
    return;
  }
  if (!confirm(`Spend ${cost} Credits on ${tier === "premium" ? "TURBO" : "TURBO BASIC"}?`)) return;

  const newBadges = (myProfile.badges || []).filter((b) => b !== "turboBasic" && b !== "turboPremium");
  newBadges.push(tier === "premium" ? "turboPremium" : "turboBasic");
  const liftsGrant = tier === "premium" ? 3 : 1;

  try {
    await updateDoc(doc(db, "users", myUid), {
      credits: increment(-cost),
      turboTier: tier,
      badges: newBadges,
      liftsAvailable: increment(liftsGrant)
    });
    myProfile = { ...myProfile, credits: (myProfile.credits || 0) - cost, turboTier: tier, badges: newBadges, liftsAvailable: (myProfile.liftsAvailable || 0) + liftsGrant };
    renderMyBadgeRow();
    renderShopMain();
    showToast(`${tier === "premium" ? "TURBO" : "TURBO BASIC"} activated! You got ${liftsGrant} Lift${liftsGrant === 1 ? "" : "s"} to give a server.`);
  } catch (err) {
    alert(err.message);
  }
}

async function renderDiscoverMain() {
  document.getElementById("main-area").innerHTML = `
    <div class="discover-main">
      <div class="empty-logo" style="font-size:24px;">Discover Servers</div>
      <p class="settings-note" style="text-align:center;">Loading featured servers...</p>
    </div>
  `;

  try {
    const q = query(collection(db, "servers"), where("featured", "==", true), limit(20));
    const snap = await getDocs(q);
    const servers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const container = document.querySelector(".discover-main");

    if (servers.length === 0) {
      container.innerHTML = `
        <div class="empty-logo" style="font-size:24px;">Discover Servers</div>
        <p class="settings-note" style="text-align:center;">No featured servers yet — check back soon!</p>
      `;
      return;
    }

    container.innerHTML = `<div class="empty-logo" style="font-size:24px;">Discover Servers</div>`;
    servers.forEach((server) => {
      const alreadyIn = myServers.some((s) => s.id === server.id);
      const card = document.createElement("div");
      card.className = "discover-card";
      card.innerHTML = `
        <div class="discover-banner" style="background-color:${server.bannerColor || "#0000ff"};"></div>
        <div class="discover-card-body">
          <div class="discover-icon" id="discover-icon-${server.id}">${getInitial(server.name)}</div>
          <div class="discover-info">
            <div class="discover-name">${escapeHtml(server.name)}${server.tagWord ? ` <span class="server-tag">${escapeHtml(server.tagEmoji || "")}${escapeHtml(server.tagWord)}</span>` : ""}</div>
            <div class="discover-count">${(server.members || []).length} player${(server.members || []).length === 1 ? "" : "s"}</div>
          </div>
          <button class="discover-join-btn" ${alreadyIn ? "disabled" : ""}>${alreadyIn ? "Joined" : "Join"}</button>
        </div>
      `;
      const iconEl = card.querySelector(`#discover-icon-${server.id}`);
      iconEl.style.backgroundColor = getAvatarColor(server.name);
      if (server.iconUrl) {
        iconEl.style.backgroundImage = `url(${server.iconUrl})`;
        iconEl.style.backgroundSize = "cover";
        iconEl.style.backgroundPosition = "center";
        iconEl.textContent = "";
      }
      if (!alreadyIn) {
        card.querySelector(".discover-join-btn").addEventListener("click", async (e) => {
          e.target.disabled = true;
          e.target.textContent = "Joining...";
          try {
            const result = await joinServerByCode(db, myUid, myUsername, server.joinCode);
            e.target.textContent = result.requested ? "Requested!" : "Joined!";
            maybeShowJoinTagsModal(result);
          } catch (err) {
            e.target.disabled = false;
            e.target.textContent = "Join";
            alert(err.message);
          }
        });
      }
      container.appendChild(card);
    });
  } catch (err) {
    document.querySelector(".discover-main").innerHTML = `<p class="settings-note">Couldn't load servers.</p>`;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  myUid = user.uid;
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const data = userDoc.exists() ? userDoc.data() : {};
  myUsername = data.username || user.email;
  myProfile = data;

  document.getElementById("my-username").textContent = myUsername;
  renderMyAvatar();
  renderMyBadgeRow();

  listenForIncomingRequests(db, myUid, renderRequests);
  listenForFriends(db, myUid, renderFriends);
  listenForMyServers(db, myUid, renderServerRail);
  listenForBlockedUsers(db, myUid, (blocked) => {
    myBlockedUsers = blocked;
    renderBlockedUsersList();
  });
  listenForShopItems(db, (items) => {
    myShopItems = items;
    renderMyAvatar();
  });

  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get("join");
  if (joinCode) {
    window.history.replaceState({}, "", window.location.pathname);
    try {
      const result = await joinServerByCode(db, myUid, myUsername, joinCode);
      alert(result.requested
        ? `Request sent to join "${result.serverName}"! Waiting for approval.`
        : `Joined "${result.serverName}"!`);
      maybeShowJoinTagsModal(result);
    } catch (err) {
      alert(err.message);
    }
  }
});

function renderRequests(requests) {
  const section = document.getElementById("requests-section");
  const list = document.getElementById("requests-list");
  list.innerHTML = "";

  if (requests.length === 0) { section.style.display = "none"; return; }
  section.style.display = "block";

  requests.forEach((req) => {
    const item = document.createElement("div");
    item.className = "request-item";
    item.innerHTML = `<span>${escapeHtml(req.fromUsername)}</span><div class="request-buttons"><button class="accept-btn">✓</button><button class="decline-btn">✕</button></div>`;
    item.querySelector(".accept-btn").addEventListener("click", () => acceptFriendRequest(db, req));
    item.querySelector(".decline-btn").addEventListener("click", () => declineFriendRequest(db, req.id));
    list.appendChild(item);
  });
}

function renderFriends(friends) {
  myFriends = friends;
  const list = document.getElementById("friends-list");
  list.innerHTML = "";

  if (friends.length === 0) {
    list.innerHTML = `<p class="empty-sub">No friends yet. Add some above!</p>`;
    return;
  }

  friends.forEach((friend) => {
    const item = document.createElement("div");
    item.className = "friend-item";
    const badge = friend.unreadCount > 0
      ? `<span class="unread-badge">${friend.unreadCount > 9 ? "9+" : friend.unreadCount}</span>`
      : "";
    const lastMsgText = friend.lastMessageAt ? formatRelativeTime(friend.lastMessageAt) : "No messages yet";
    item.innerHTML = `
      <div class="avatar-circle small-avatar" style="background-color:${getAvatarColor(friend.username)}">${getInitial(friend.username)}</div>
      <div class="friend-info">
        <span class="friend-name">${escapeHtml(friend.username)}</span>
        <span class="friend-last-msg">${escapeHtml(lastMsgText)}</span>
      </div>
      ${badge}
    `;
    const avatarEl = item.querySelector(".avatar-circle");
    applyAvatarImage(avatarEl, friend.uid);
    avatarEl.addEventListener("click", (e) => {
      e.stopPropagation();
      openProfileView(friend.uid, friend.username);
    });
    item.addEventListener("click", () => openChat(friend));
    list.appendChild(item);
  });
}

function renderServerRail(servers) {
  myServers = servers;
  if (currentServer) {
    const updated = servers.find((s) => s.id === currentServer.id);
    if (updated) currentServer = updated;
  }

  const rail = document.getElementById("server-list");
  rail.innerHTML = "";
  servers.forEach((server) => {
    const wrapper = document.createElement("div");
    wrapper.className = "rail-icon-wrapper";

    const icon = document.createElement("div");
    icon.className = "rail-icon server-icon";
    icon.textContent = getInitial(server.name);
    icon.title = server.name;
    if (server.iconUrl) {
      icon.style.backgroundImage = `url(${server.iconUrl})`;
      icon.style.backgroundSize = "cover";
      icon.style.backgroundPosition = "center";
      icon.textContent = "";
    }
    icon.addEventListener("click", () => selectServer(server));
    wrapper.appendChild(icon);

    const mentionCount = (server.mentions && server.mentions[myUid]) || 0;
    if (mentionCount > 0) {
      const badge = document.createElement("span");
      badge.className = "rail-badge";
      badge.textContent = mentionCount > 9 ? "9+" : mentionCount;
      wrapper.appendChild(badge);
    }

    if (mentionsInitialized && mentionCount > (previousMentions[server.id] || 0)) {
      showToast(`You were mentioned in ${server.name}`);
    }
    previousMentions[server.id] = mentionCount;

    rail.appendChild(wrapper);
  });
  mentionsInitialized = true;
}

function renderPublicLifts(server) {
  const lifts = server.lifts || 0;
  const filled = Math.min(lifts, 5);
  const fillEl = document.getElementById("public-lifts-bar-fill");
  const textEl = document.getElementById("public-lifts-count-text");
  const btnEl = document.getElementById("public-apply-lift-btn");
  if (!fillEl) return;
  fillEl.style.width = `${(filled / 5) * 100}%`;
  textEl.textContent = lifts > 5 ? `${lifts} Lifts` : `${lifts}/5 Lifts`;
  btnEl.style.display = (myProfile.liftsAvailable || 0) > 0 ? "inline-block" : "none";
}

function renderServerHeader(server, isOwner) {
  const iconEl = document.getElementById("server-header-icon");
  iconEl.style.backgroundImage = "none";
  iconEl.textContent = getInitial(server.name);
  iconEl.style.backgroundColor = getAvatarColor(server.name);
  if (server.iconUrl) {
    iconEl.style.backgroundImage = `url(${server.iconUrl})`;
    iconEl.style.backgroundSize = "cover";
    iconEl.style.backgroundPosition = "center";
    iconEl.textContent = "";
  }
  document.getElementById("server-view-name").textContent = server.name;
  const count = server.members ? server.members.length : 1;
  document.getElementById("server-view-count").textContent = `${count} player${count === 1 ? "" : "s"}`;
  const bannerEl = document.getElementById("server-banner");
  if (server.bannerImageUrl) {
    bannerEl.style.backgroundImage = `url(${server.bannerImageUrl})`;
    bannerEl.style.backgroundSize = "cover";
    bannerEl.style.backgroundPosition = "center";
  } else {
    bannerEl.style.backgroundImage = "none";
    bannerEl.style.backgroundColor = server.bannerColor || "#0000ff";
  }
  document.getElementById("server-settings-btn").style.display = isOwner ? "flex" : "none";
  document.getElementById("server-leave-btn").style.display = isOwner ? "none" : "flex";
}

function selectServer(server) {
  document.querySelectorAll(".sidebar-nav-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById("friends-view").style.display = "none";
  document.getElementById("quests-nav-view").style.display = "none";
  document.getElementById("shop-nav-view").style.display = "none";
  document.getElementById("discover-nav-view").style.display = "none";
  currentServer = server;
  document.getElementById("server-view").style.display = "block";

  const isOwner = server.ownerUid === myUid;
  const canManage = isOwner || memberHasPerm(server, myUid, "manageChannels");
  renderServerHeader(server, isOwner);
  renderPublicLifts(server);
  document.getElementById("add-channel-btn").style.display = canManage ? "flex" : "none";
  document.getElementById("add-category-btn").style.display = canManage ? "flex" : "none";

  if ((server.mentions && server.mentions[myUid]) > 0) {
    clearServerMentions(db, server.id, myUid);
  }

  if (currentChannelsUnsubscribe) currentChannelsUnsubscribe();
  currentChannelsUnsubscribe = listenForChannels(db, server.id, (channels) => renderChannelList(server, channels, isOwner, canManage));

  if (currentJoinRequestsUnsubscribe) { currentJoinRequestsUnsubscribe(); currentJoinRequestsUnsubscribe = null; }
  if (isOwner) {
    currentJoinRequestsUnsubscribe = listenForJoinRequests(db, server.id, (requests) => renderServerJoinRequests(server, requests));
  } else {
    document.getElementById("server-join-requests").style.display = "none";
  }

  document.getElementById("main-area").innerHTML = `
    <div class="empty-main">
      <div class="empty-logo">${escapeHtml(server.name)}</div>
      <p>Pick a channel to start chatting</p>
    </div>
  `;
  currentChat = null;
  if (currentMessagesUnsubscribe) { currentMessagesUnsubscribe(); currentMessagesUnsubscribe = null; }
  if (currentTypingUnsubscribe) { currentTypingUnsubscribe(); currentTypingUnsubscribe = null; }
}

function renderChannelItem(server, ch, canManage) {
  const item = document.createElement("div");
  item.className = "channel-item";
  const gearHtml = canManage ? `<button class="channel-gear-btn">${ICONS.gear}</button>` : "";
  const lastMsg = ch.lastMessageAt ? ch.lastMessageAt.toMillis() : 0;
  const lastRead = (ch.lastRead && ch.lastRead[myUid]) ? ch.lastRead[myUid].toMillis() : 0;
  const unreadDot = lastMsg > lastRead ? `<span class="channel-dot"></span>` : "";

  item.innerHTML = `<span class="channel-hash">#</span><span class="channel-name-text">${escapeHtml(ch.name)}</span>${unreadDot}${gearHtml}`;
  item.querySelector(".channel-name-text").addEventListener("click", () => openChannel(server, ch));
  item.querySelector(".channel-hash").addEventListener("click", () => openChannel(server, ch));
  const gearBtn = item.querySelector(".channel-gear-btn");
  if (gearBtn) {
    gearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openChannelSettings(server, ch);
    });
  }
  return item;
}

function renderChannelList(server, channels, isOwner, canManage) {
  const list = document.getElementById("channel-list");
  list.innerHTML = "";
  const categories = server.categories || {};
  const visibleChannels = channels.filter((ch) => ch.type !== "mod" || isOwner);

  const uncategorized = visibleChannels.filter((ch) => !ch.categoryId || !categories[ch.categoryId]);
  uncategorized.forEach((ch) => list.appendChild(renderChannelItem(server, ch, canManage)));

  Object.entries(categories).forEach(([catId, cat]) => {
    const chsInCat = visibleChannels.filter((ch) => ch.categoryId === catId);
    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `<span>${escapeHtml(cat.name)}</span>`;
    if (canManage) {
      const delBtn = document.createElement("button");
      delBtn.className = "category-delete-btn";
      delBtn.innerHTML = ICONS.trash;
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Delete category "${cat.name}"? Its channels become uncategorized.`)) return;
        await deleteCategory(db, server.id, catId);
      });
      header.appendChild(delBtn);
    }
    list.appendChild(header);
    chsInCat.forEach((ch) => list.appendChild(renderChannelItem(server, ch, canManage)));
  });
}

function renderServerJoinRequests(server, requests) {
  const section = document.getElementById("server-join-requests");
  const list = document.getElementById("server-join-requests-list");
  list.innerHTML = "";

  if (requests.length === 0) { section.style.display = "none"; return; }
  section.style.display = "block";

  const sorted = [...requests].sort((a, b) => {
    const at = a.createdAt ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt ? b.createdAt.toMillis() : 0;
    return at - bt;
  });

  sorted.forEach((req) => {
    const item = document.createElement("div");
    item.className = "request-item";
    item.innerHTML = `<span>${escapeHtml(req.username)}</span><div class="request-buttons"><button class="accept-btn">✓</button><button class="decline-btn">✕</button></div>`;
    item.querySelector(".accept-btn").addEventListener("click", () => approveJoinRequest(db, server.id, req.uid, req.username));
    item.querySelector(".decline-btn").addEventListener("click", () => declineJoinRequest(db, server.id, req.uid));
    list.appendChild(item);
  });
}

function populateCategorySelect(selectId, serverObj, selectedId) {
  const select = document.getElementById(selectId);
  select.innerHTML = `<option value="">No category</option>` +
    Object.entries(serverObj.categories || {}).map(([id, c]) => `<option value="${id}" ${id === selectedId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
}

function openChannelSettings(server, channel) {
  editingChannel = { server, channel };
  document.getElementById("edit-channel-name").value = channel.name;
  populateCategorySelect("edit-channel-category", server, channel.categoryId);
  const lockRow = document.getElementById("channel-lock-row");
  const checkbox = document.getElementById("edit-channel-allow-talk");
  if (channel.type === "general") {
    lockRow.style.display = "flex";
    checkbox.checked = !channel.locked;
  } else {
    lockRow.style.display = "none";
  }
  document.getElementById("channel-modal-backdrop").style.display = "flex";
}

function groupMessages(messages) {
  const groups = [];
  const TEN_MIN = 10 * 60 * 1000;

  messages.forEach((msg) => {
    const lastGroup = groups[groups.length - 1];
    const msgTime = msg.createdAt ? msg.createdAt.toMillis() : Date.now();

    if (lastGroup && lastGroup.senderId === msg.senderId && msgTime - lastGroup.lastTime <= TEN_MIN) {
      lastGroup.messages.push(msg);
      lastGroup.lastTime = msgTime;
    } else {
      groups.push({ senderId: msg.senderId, senderUsername: msg.senderUsername, firstTime: msg.createdAt, lastTime: msgTime, messages: [msg] });
    }
  });

  return groups;
}

function renderReactions(msg) {
  const reactions = msg.reactions || {};
  const superReactions = msg.superReactions || {};
  const emojis = Object.keys(reactions).filter((e) => reactions[e] && reactions[e].length > 0);
  const superEmojis = Object.keys(superReactions).filter((e) => superReactions[e] && superReactions[e].length > 0);
  if (emojis.length === 0 && superEmojis.length === 0) return "";

  const pills = emojis.map((emoji) => {
    const count = reactions[emoji].length;
    const mine = reactions[emoji].includes(myUid) ? "mine" : "";
    return `<span class="reaction-pill ${mine}" data-msg-id="${msg.id}" data-emoji="${emoji}">${emoji} ${count}</span>`;
  }).join("");

  const superPills = superEmojis.map((emoji) => {
    const count = superReactions[emoji].length;
    const mine = superReactions[emoji].includes(myUid) ? "mine" : "";
    return `<span class="reaction-pill super-pill ${mine}" data-msg-id="${msg.id}" data-emoji="${emoji}" data-super="1">${emoji} ${count}</span>`;
  }).join("");

  return `<div class="reactions-row">${pills}${superPills}</div>`;
}

function renderInviteCard(msg) {
  const inv = msg.invite;
  return `
    <div class="invite-card" data-server-id="${inv.serverId}" data-join-code="${inv.joinCode}">
      <div class="invite-card-name">${escapeHtml(inv.serverName)}</div>
      <div class="invite-card-count" id="invite-count-${msg.id}">Loading players...</div>
      <button class="invite-join-btn" data-msg-id="${msg.id}">Join Server</button>
    </div>
  `;
}

function renderSingleMessage(msg) {
  const replyHtml = msg.replyTo
    ? `<div class="reply-quote">${ICONS.reply} ${escapeHtml(msg.replyTo.senderUsername)}: ${escapeHtml(msg.replyTo.text)}</div>`
    : "";

  const quickHtml = QUICK_REACTIONS.map((e) => `<span class="emoji-option quick-react" data-msg-id="${msg.id}" data-emoji="${e}">${e}</span>`).join("");

  const contentHtml = msg.call
    ? `<div class="call-card" data-room="${msg.call.room}"><div class="call-card-icon">${ICONS.call}</div><div class="call-card-text">Started a call</div><button class="join-call-btn" data-room="${msg.call.room}">Join Call</button></div>`
    : msg.invite
    ? renderInviteCard(msg)
    : msg.gifUrl
    ? `<img class="message-gif" src="${msg.gifUrl}">`
    : `<p class="message-text">${renderTextWithMentions(msg.text)}</p>`;

  const hasMention = /@\w+/.test(msg.text || "");
  const canDelete = msg.senderId === myUid ||
    (currentChat && currentChat.type === "channel" && (currentChat.isOwner || memberHasPerm(currentServer, myUid, "deleteMessages")));
  const deleteHtml = canDelete ? `<button class="delete-msg-btn" data-msg-id="${msg.id}">${ICONS.trash}</button>` : "";
  const superBtnHtml = hasSuperReact() ? `<button class="super-react-btn" data-msg-id="${msg.id}">${ICONS.star}</button>` : "";

  return `
    <div class="message-line ${hasMention ? "mentioned" : ""}">
      ${replyHtml}
      ${contentHtml}
      <span class="message-actions">
        <button class="react-btn" data-msg-id="${msg.id}">${ICONS.addReaction}</button>
        ${superBtnHtml}
        <button class="reply-btn" data-msg-id="${msg.id}" data-sender="${escapeHtml(msg.senderUsername)}" data-text="${escapeHtml(msg.text || (msg.gifUrl ? 'a GIF' : (msg.invite ? 'a server invite' : '')))}">${ICONS.reply}</button>
        ${deleteHtml}
      </span>
      <div class="quick-reactions" id="quick-${msg.id}" style="display:none;">${quickHtml}</div>
      ${renderReactions(msg)}
    </div>
  `;
}

function renderMessages(messages) {
  const list = document.getElementById("messages-list");
  if (!list) return;
  list.innerHTML = "";

  groupMessages(messages).forEach((group) => {
    const row = document.createElement("div");
    row.className = "message-row";
    const linesHtml = group.messages.map((msg) => renderSingleMessage(msg)).join("");
    const roleColor = currentChat && currentChat.type === "channel" ? getRoleColorForMember(group.senderId) : null;
    const senderStyle = roleColor ? ` style="color:${roleColor}"` : "";

    row.innerHTML = `
      <div class="avatar-circle msg-avatar clickable-profile" data-uid="${group.senderId}" data-username="${escapeHtml(group.senderUsername)}" style="background-color:${getAvatarColor(group.senderUsername)}">${getInitial(group.senderUsername)}</div>
      <div class="message-content">
        <span class="message-sender clickable-profile" data-uid="${group.senderId}" data-username="${escapeHtml(group.senderUsername)}"${senderStyle}>${escapeHtml(group.senderUsername)}<span class="equipped-tag-slot" data-uid="${group.senderId}"></span><span class="message-time">${formatTime(group.firstTime)}</span></span>
        ${linesHtml}
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll(".msg-avatar, .message-sender").forEach((el) => {
    el.addEventListener("click", () => openProfileView(el.dataset.uid, el.dataset.username));
  });

  list.querySelectorAll(".msg-avatar").forEach((el) => {
    applyAvatarImage(el, el.dataset.uid);
  });

  list.querySelectorAll(".equipped-tag-slot").forEach((el) => {
    applyEquippedTagOnly(el, el.dataset.uid);
  });

  list.querySelectorAll(".react-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = document.getElementById("quick-" + btn.dataset.msgId);
      el.dataset.mode = "normal";
      el.style.display = el.style.display === "none" ? "flex" : "none";
    });
  });

  list.querySelectorAll(".super-react-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = document.getElementById("quick-" + btn.dataset.msgId);
      el.dataset.mode = "super";
      el.style.display = el.style.display === "none" ? "flex" : "none";
    });
  });

  list.querySelectorAll(".quick-react").forEach((el) => {
    el.addEventListener("click", () => {
      const panel = el.parentElement;
      if (panel.dataset.mode === "super") {
        toggleSuperReaction(db, currentChat.pathSegments, el.dataset.msgId, el.dataset.emoji, myUid);
      } else {
        toggleReaction(db, currentChat.pathSegments, el.dataset.msgId, el.dataset.emoji, myUid);
      }
      panel.style.display = "none";
    });
  });

  list.querySelectorAll(".reaction-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      if (pill.dataset.super) {
        toggleSuperReaction(db, currentChat.pathSegments, pill.dataset.msgId, pill.dataset.emoji, myUid);
      } else {
        toggleReaction(db, currentChat.pathSegments, pill.dataset.msgId, pill.dataset.emoji, myUid);
      }
    });
  });

  list.querySelectorAll(".reply-btn").forEach((btn) => {
    btn.addEventListener("click", () => startReply(btn.dataset.msgId, btn.dataset.sender, btn.dataset.text));
  });

  list.querySelectorAll(".delete-msg-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this message? This can't be undone.")) return;
      try {
        await deleteMessage(db, currentChat.pathSegments, btn.dataset.msgId);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  list.querySelectorAll(".join-call-btn").forEach((btn) => {
    btn.addEventListener("click", () => openCallOverlay(btn.dataset.room, null));
  });

  list.querySelectorAll(".invite-card").forEach(async (card) => {
    const serverId = card.dataset.serverId;
    const countEl = card.querySelector(".invite-card-count");
    try {
      const snap = await getDoc(doc(db, "servers", serverId));
      if (snap.exists()) {
        const n = (snap.data().members || []).length;
        countEl.textContent = `${n} player${n === 1 ? "" : "s"}`;
      } else {
        countEl.textContent = "Server no longer exists";
      }
    } catch (err) {
      countEl.textContent = "";
    }
  });

  list.querySelectorAll(".invite-join-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".invite-card");
      const code = card.dataset.joinCode;
      btn.disabled = true;
      btn.textContent = "Joining...";
      try {
        const result = await joinServerByCode(db, myUid, myUsername, code);
        btn.textContent = result.requested ? "Requested!" : "Joined!";
        maybeShowJoinTagsModal(result);
      } catch (err) {
        btn.textContent = "Join Server";
        btn.disabled = false;
        alert(err.message);
      }
    });
  });

  list.scrollTop = list.scrollHeight;
}

function startReply(msgId, senderUsername, text) {
  replyingTo = { messageId: msgId, senderUsername, text };
  renderReplyPreview();
  const input = document.getElementById("message-input");
  if (input && !input.value.startsWith("@" + senderUsername)) {
    input.value = `@${senderUsername} ` + input.value;
  }
  if (input) input.focus();
}

function cancelReply() {
  replyingTo = null;
  renderReplyPreview();
}

function renderReplyPreview() {
  const container = document.getElementById("reply-preview-container");
  if (!container) return;
  if (!replyingTo) { container.innerHTML = ""; return; }
  container.innerHTML = `
    <div class="reply-preview">
      <span>Replying to ${escapeHtml(replyingTo.senderUsername)}: ${escapeHtml(replyingTo.text)}</span>
      <button id="cancel-reply-btn">✕</button>
    </div>
  `;
  document.getElementById("cancel-reply-btn").addEventListener("click", cancelReply);
}

function buildEmojiPicker() {
  const grid = document.getElementById("emoji-grid");
  grid.innerHTML = EMOJI_LIST.map((e) => `<span class="emoji-option">${e}</span>`).join("");
  grid.querySelectorAll(".emoji-option").forEach((el) => {
    el.addEventListener("click", () => {
      const input = document.getElementById("message-input");
      input.value += el.textContent;
      input.focus();
      document.getElementById("picker-popup").style.display = "none";
    });
  });
}

function setupPickerTabs() {
  document.querySelectorAll(".picker-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".picker-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.getElementById("emoji-panel").style.display = target === "emoji" ? "block" : "none";
      document.getElementById("gif-panel").style.display = target === "gif" ? "block" : "none";
    });
  });
}

async function runGifSearch(query) {
  const resultsEl = document.getElementById("gif-results");
  if (!query) { resultsEl.innerHTML = ""; return; }
  resultsEl.innerHTML = `<p class="gif-loading">Searching...</p>`;
  try {
    const gifs = await searchGifs(query);
    resultsEl.innerHTML = gifs.map((g) => `<img class="gif-thumb" src="${g.preview}" data-full="${g.full}">`).join("");
    resultsEl.querySelectorAll(".gif-thumb").forEach((img) => {
      img.addEventListener("click", () => sendGif(img.dataset.full));
    });
  } catch (err) {
    resultsEl.innerHTML = `<p class="gif-loading">Couldn't load GIFs.</p>`;
  }
}

function sendGif(url) {
  if (!currentChat) return;
  sendMessage(db, currentChat.pathSegments, myUid, myUsername, "", replyingTo, url, currentChat.recipientUid || null);
  replyingTo = null;
  renderReplyPreview();
  document.getElementById("picker-popup").style.display = "none";
}

function renderComposerHTML(canWrite, placeholder, timedOut) {
  if (!canWrite) {
    const text = timedOut ? "You are timed out in this server" : "Only the owner can post in this channel";
    return `<div class="readonly-banner">${ICONS.lock} ${text}</div>`;
  }
  return `
    <div id="typing-indicator" class="typing-indicator" style="display:none;"></div>
    <div id="reply-preview-container"></div>
    <div class="message-input-row" id="message-input-row">
      <button id="plus-btn" class="icon-btn" title="Add image (coming soon)">+</button>
      <div class="input-wrapper">
        <input type="text" id="message-input" placeholder="${placeholder}">
        <button id="emoji-btn" class="icon-btn emoji-toggle" title="Emoji & GIFs">${ICONS.smile}</button>
      </div>
      <button id="send-btn">Send</button>
      <div id="picker-popup" class="picker-popup" style="display:none;">
        <div class="picker-tabs">
          <button class="picker-tab active" data-tab="emoji">Emoji</button>
          <button class="picker-tab" data-tab="gif">GIF</button>
        </div>
        <div id="emoji-panel" class="picker-panel">
          <div id="emoji-grid" class="emoji-grid"></div>
        </div>
        <div id="gif-panel" class="picker-panel" style="display:none;">
          <input type="text" id="gif-search-input" placeholder="Search GIFs...">
          <div id="gif-results" class="gif-results"></div>
          <div class="gif-credit">Powered by GIPHY</div>
        </div>
      </div>
    </div>
  `;
}

function attachComposerListeners(canWrite) {
  if (!canWrite) return;
  document.getElementById("send-btn").addEventListener("click", sendCurrentMessage);
  document.getElementById("message-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendCurrentMessage();
  });
  document.getElementById("message-input").addEventListener("input", () => {
    const now = Date.now();
    if (currentChat && now - typingThrottle > 2500) {
      typingThrottle = now;
      setTyping(db, currentChat.pathSegments, myUid, myUsername);
    }
  });
  document.getElementById("plus-btn").addEventListener("click", () => {
    alert("Image uploads are coming in a future step!");
  });
  buildEmojiPicker();
  setupPickerTabs();
  document.getElementById("emoji-btn").addEventListener("click", () => {
    const popup = document.getElementById("picker-popup");
    popup.style.display = popup.style.display === "none" ? "block" : "none";
  });
  document.getElementById("gif-search-input").addEventListener("input", (e) => {
    clearTimeout(gifSearchTimeout);
    const query = e.target.value.trim();
    gifSearchTimeout = setTimeout(() => runGifSearch(query), 400);
  });
}

function openChat(friend) {
  document.querySelectorAll(".sidebar-nav-btn").forEach((b) => b.classList.remove("active"));
  replyingTo = null;
  const fsId = friendshipId(myUid, friend.uid);
  currentChat = { type: "dm", pathSegments: ["friendships", fsId], recipientUid: friend.uid };
  markAsRead(db, fsId, myUid);

  document.getElementById("main-area").innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <div class="avatar-circle small-avatar clickable-profile" id="chat-header-avatar" style="background-color:${getAvatarColor(friend.username)}">${getInitial(friend.username)}</div>
        <span class="chat-username clickable-profile" id="chat-header-username">${escapeHtml(friend.username)}</span>
        <button id="start-call-btn" class="icon-btn" title="Start a call" style="margin-left:auto;"></button>
      </div>
      <div class="messages-list" id="messages-list"></div>
      ${renderComposerHTML(true, `Message @${escapeHtml(friend.username)}`)}
    </div>
  `;

  applyAvatarImage(document.getElementById("chat-header-avatar"), friend.uid);
  document.getElementById("chat-header-avatar").addEventListener("click", () => openProfileView(friend.uid, friend.username));
  document.getElementById("chat-header-username").addEventListener("click", () => openProfileView(friend.uid, friend.username));
  setIcon("start-call-btn", ICONS.call);
  document.getElementById("start-call-btn").addEventListener("click", () => startCall(friend));

  if (currentMessagesUnsubscribe) currentMessagesUnsubscribe();
  currentMessagesUnsubscribe = listenForMessages(db, currentChat.pathSegments, renderMessages);
  if (currentTypingUnsubscribe) currentTypingUnsubscribe();
  currentTypingUnsubscribe = listenForTyping(db, currentChat.pathSegments, renderTypingIndicator);
  attachComposerListeners(true);
}

function openChannel(server, channel) {
  const isOwner = server.ownerUid === myUid;
  const timeoutUntil = (server.timeouts || {})[myUid];
  const isTimedOut = !!(timeoutUntil && timeoutUntil.toMillis && timeoutUntil.toMillis() > Date.now());
  const canWrite = !isTimedOut && (isOwner || (channel.type === "general" && !channel.locked));
  replyingTo = null;
  currentChat = { type: "channel", pathSegments: ["servers", server.id, "channels", channel.id], canWrite, serverId: server.id, channelId: channel.id, isOwner };

  markChannelRead(db, server.id, channel.id, myUid);

  document.getElementById("main-area").innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <span class="chat-username">#${escapeHtml(channel.name)}</span>
      </div>
      <div class="messages-list" id="messages-list"></div>
      ${renderComposerHTML(canWrite, `Message #${escapeHtml(channel.name)}`, isTimedOut)}
    </div>
  `;

  if (currentMessagesUnsubscribe) currentMessagesUnsubscribe();
  currentMessagesUnsubscribe = listenForMessages(db, currentChat.pathSegments, renderMessages);
  if (currentTypingUnsubscribe) currentTypingUnsubscribe();
  currentTypingUnsubscribe = listenForTyping(db, currentChat.pathSegments, renderTypingIndicator);
  attachComposerListeners(canWrite);
}

function computeTagPings() {
  if (!currentServer || !currentServer.joinableTags) return [];
  const memberTags = currentServer.memberTags || {};
  return currentServer.joinableTags
    .map((tag) => ({
      tagName: tag,
      uids: Object.keys(memberTags).filter((uid) => (memberTags[uid] || []).includes(tag))
    }))
    .filter((tp) => tp.uids.length > 0);
}

function sendCurrentMessage() {
  const input = document.getElementById("message-input");
  const text = input.value;
  if (!text.trim() || !currentChat) return;

  const channelMeta = currentChat.type === "channel"
    ? { serverId: currentChat.serverId, channelId: currentChat.channelId, tagPings: computeTagPings() }
    : null;

  sendMessage(db, currentChat.pathSegments, myUid, myUsername, text, replyingTo, null, currentChat.recipientUid || null, null, channelMeta);
  input.value = "";
  replyingTo = null;
  renderReplyPreview();
}

function openInviteModal(server) {
  document.getElementById("invite-server-name").textContent = server.name;
  document.getElementById("invite-link-input").value = getJoinLinkForCode(server.joinCode);
  document.getElementById("invite-copy-message").textContent = "";

  const list = document.getElementById("invite-friends-list");
  list.innerHTML = "";
  if (myFriends.length === 0) {
    list.innerHTML = `<p class="empty-sub">No friends yet to invite.</p>`;
  } else {
    myFriends.forEach((friend) => {
      const item = document.createElement("div");
      item.className = "friend-item";
      item.innerHTML = `<div class="avatar-circle small-avatar" style="background-color:${getAvatarColor(friend.username)}">${getInitial(friend.username)}</div><span class="friend-name">${escapeHtml(friend.username)}</span><button class="invite-send-btn">Send</button>`;
      applyAvatarImage(item.querySelector(".avatar-circle"), friend.uid);
      item.querySelector(".invite-send-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        sendServerInvite(server, friend);
        e.target.textContent = "Sent!";
        e.target.disabled = true;
      });
      list.appendChild(item);
    });
  }
  document.getElementById("invite-modal-backdrop").style.display = "flex";
}

function sendServerInvite(server, friend) {
  const fsId = friendshipId(myUid, friend.uid);
  sendMessage(db, ["friendships", fsId], myUid, myUsername, "", null, null, friend.uid, {
    serverId: server.id,
    serverName: server.name,
    joinCode: server.joinCode
  });
}

function buildColorSwatches(containerId, selectedColor, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = BANNER_COLORS.map((c) =>
    `<button type="button" class="color-swatch ${c === selectedColor ? "selected" : ""}" data-color="${c}" style="background-color:${c};"></button>`
  ).join("");
  container.querySelectorAll(".color-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".color-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      onSelect(btn.dataset.color);
    });
  });
}

function renderProfileViewActions(uid, username, dmPrivacy) {
  const container = document.getElementById("profile-view-actions");
  container.innerHTML = "";
  if (uid === myUid) return;

  const isFriend = myFriends.some((f) => f.uid === uid);
  const blocked = isBlocked(uid);

  const messageBtn = document.createElement("button");
  messageBtn.className = "secondary small-btn profile-action-btn";
  messageBtn.textContent = "Message";
  messageBtn.addEventListener("click", () => startDirectMessage(uid, username, dmPrivacy, isFriend));
  container.appendChild(messageBtn);

  if (isFriend) {
    const unfriendBtn = document.createElement("button");
    unfriendBtn.className = "secondary small-btn profile-action-btn";
    unfriendBtn.textContent = "Unfriend";
    unfriendBtn.addEventListener("click", async () => {
      if (!confirm(`Unfriend ${username}?`)) return;
      await unfriendUser(db, friendshipId(myUid, uid));
      document.getElementById("profile-view-modal-backdrop").style.display = "none";
    });
    container.appendChild(unfriendBtn);
  }

  const blockBtn = document.createElement("button");
  blockBtn.className = blocked ? "secondary small-btn profile-action-btn" : "danger small-btn profile-action-btn";
  blockBtn.textContent = blocked ? "Unblock" : "Block";
  blockBtn.addEventListener("click", async () => {
    if (blocked) {
      await unblockUser(db, myUid, uid);
    } else {
      if (!confirm(`Block ${username}? They won't be able to message you.`)) return;
      await blockUser(db, myUid, myUsername, uid, username);
    }
    document.getElementById("profile-view-modal-backdrop").style.display = "none";
  });
  container.appendChild(blockBtn);
}

async function startDirectMessage(targetUid, targetUsername, dmPrivacy, isFriend) {
  if (isFriend) {
    document.getElementById("profile-view-modal-backdrop").style.display = "none";
    openChat({ uid: targetUid, username: targetUsername });
    return;
  }
  const privacy = dmPrivacy || "friends";
  if (privacy === "nobody") {
    showToast(`${targetUsername} isn't accepting messages right now.`);
    return;
  }
  if (privacy === "friends") {
    showToast(`${targetUsername} only accepts messages from friends.`);
    return;
  }
  try {
    const fsId = friendshipId(myUid, targetUid);
    await setDoc(doc(db, "friendships", fsId), {
      members: [myUid, targetUid],
      usernames: { [myUid]: myUsername, [targetUid]: targetUsername },
      unread: { [myUid]: 0, [targetUid]: 0 },
      createdAt: serverTimestamp(),
      isDmOnly: true
    });
    document.getElementById("profile-view-modal-backdrop").style.display = "none";
    openChat({ uid: targetUid, username: targetUsername });
  } catch (err) {
    alert(err.message);
  }
}

async function openProfileView(uid, fallbackUsername) {
  const modal = document.getElementById("profile-view-modal-backdrop");
  document.getElementById("profile-view-username").textContent = fallbackUsername;
  const avatarEl = document.getElementById("profile-view-avatar");
  avatarEl.style.backgroundImage = "none";
  avatarEl.style.backgroundColor = getAvatarColor(fallbackUsername);
  avatarEl.textContent = getInitial(fallbackUsername);
  const bannerEl = document.getElementById("profile-view-banner");
  bannerEl.style.backgroundImage = "none";
  bannerEl.style.backgroundColor = "#2a2a33";
  document.getElementById("profile-view-bio").textContent = "Loading...";
  document.getElementById("profile-view-gender").textContent = "Loading...";
  document.getElementById("profile-view-badge-row").innerHTML = "";
  document.getElementById("profile-view-actions").innerHTML = "";
  document.getElementById("profile-view-server-role-field").style.display = "none";
  document.getElementById("profile-view-wishlist-field").style.display = "none";
  renderAvatarEffect(document.getElementById("profile-view-avatar-effect"), null);
  modal.style.display = "flex";

  try {
    const data = uid === myUid ? myProfile : (await getDoc(doc(db, "users", uid))).data() || {};
    bannerEl.style.backgroundColor = data.bannerColor || "#0000ff";
    document.getElementById("profile-view-bio").textContent = data.bio && data.bio.trim() ? data.bio : "No bio yet.";
    document.getElementById("profile-view-gender").textContent = data.gender && data.gender.trim() ? data.gender : "Not specified";
    document.getElementById("profile-view-badge-row").innerHTML = renderBadgesHtml(data.badges) + renderEquippedTagHtml(data.equippedTag);
    document.querySelectorAll("#profile-view-badge-row .equipped-tag").forEach((tagEl) => {
      tagEl.addEventListener("click", (e) => {
        e.stopPropagation();
        handleTagClick(tagEl.dataset.serverId, tagEl.dataset.joinCode);
      });
    });
    renderProfileViewActions(uid, fallbackUsername, data.dmPrivacy);
    renderAvatarEffect(document.getElementById("profile-view-avatar-effect"), data.equippedEffect);
    if (data.pfpUrl) {
      avatarEl.style.backgroundImage = `url(${data.pfpUrl})`;
      avatarEl.style.backgroundSize = "cover";
      avatarEl.style.backgroundPosition = "center";
      avatarEl.textContent = "";
    }

    if (currentServer && (currentServer.members || []).includes(uid)) {
      const roleId = (currentServer.memberRoles || {})[uid];
      const role = roleId ? (currentServer.roles || {})[roleId] : null;
      const tags = (currentServer.memberTags || {})[uid] || [];
      const parts = [];
      if (role) parts.push(`<span style="color:${role.color}">${escapeHtml(role.name)}</span>`);
      if (tags.length) parts.push(tags.map((t) => escapeHtml(t)).join(", "));
      if (parts.length) {
        document.getElementById("profile-view-server-role-field").style.display = "block";
        document.getElementById("profile-view-server-role").innerHTML = parts.join(" &middot; ");
      }
    }

    const wishlist = data.wishlist || [];
    if (wishlist.length > 0) {
      document.getElementById("profile-view-wishlist-field").style.display = "block";
      document.getElementById("profile-view-wishlist").textContent = wishlist
        .map((id) => { const item = myShopItems.find((i) => i.id === id); return item ? item.name : "Unknown item"; })
        .join(", ");
    }
  } catch (err) {
    document.getElementById("profile-view-bio").textContent = "Couldn't load profile.";
    document.getElementById("profile-view-gender").textContent = "";
  }
}

on("close-profile-view-btn", "click", () => {
  document.getElementById("profile-view-modal-backdrop").style.display = "none";
});

on("my-avatar", "click", () => openProfileView(myUid, myUsername));

on("open-add-friend-btn", "click", () => {
  document.getElementById("add-friend-input").value = "";
  document.getElementById("add-friend-message").textContent = "";
  document.getElementById("add-friend-modal-backdrop").style.display = "flex";
});

on("close-add-friend-modal-btn", "click", () => {
  document.getElementById("add-friend-modal-backdrop").style.display = "none";
});

on("add-friend-btn", "click", async () => {
  const input = document.getElementById("add-friend-input");
  const targetUsername = input.value.trim();
  const messageBox = document.getElementById("add-friend-message");
  if (!targetUsername) return;

  try {
    await sendFriendRequest(db, myUid, myUsername, targetUsername);
    messageBox.textContent = "Friend request sent!";
    messageBox.style.color = "#4ade80";
    input.value = "";
  } catch (error) {
    messageBox.textContent = error.message;
    messageBox.style.color = "#f87171";
  }
});

on("logout-btn", "click", () => {
  signOut(auth).then(() => window.location.href = "login.html");
});

on("rail-add-btn", "click", () => {
  document.getElementById("server-modal-backdrop").style.display = "flex";
});
on("close-server-modal-btn", "click", () => {
  document.getElementById("server-modal-backdrop").style.display = "none";
});

document.querySelectorAll(".modal-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.modalTab;
    document.getElementById("create-panel").style.display = target === "create" ? "block" : "none";
    document.getElementById("join-panel").style.display = target === "join" ? "block" : "none";
  });
});

document.querySelectorAll("#settings-modal-backdrop .settings-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#settings-modal-backdrop .settings-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.settingsTab;
    document.getElementById("settings-display-panel").style.display = target === "display" ? "block" : "none";
    document.getElementById("settings-account-panel").style.display = target === "account" ? "block" : "none";
    document.getElementById("settings-security-panel").style.display = target === "security" ? "block" : "none";
  });
});

document.querySelectorAll("#roles-modal-backdrop .settings-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#roles-modal-backdrop .settings-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.rolesTab;
    document.getElementById("roles-tab-panel").style.display = target === "roles" ? "block" : "none";
    document.getElementById("members-tab-panel").style.display = target === "members" ? "block" : "none";
  });
});

async function handleCreateServer(isPrivate) {
  const nameInput = document.getElementById("new-server-name");
  const msg = document.getElementById("server-modal-message");
  const name = nameInput.value.trim();
  if (name.length < 2) {
    msg.textContent = "Server name needs to be at least 2 characters.";
    msg.style.color = "#f87171";
    return;
  }
  const publicBtn = document.getElementById("create-public-btn");
  const privateBtn = document.getElementById("create-private-btn");
  publicBtn.disabled = true;
  privateBtn.disabled = true;
  msg.textContent = "Creating server...";
  msg.style.color = "#8a8fa3";
  try {
    const result = await createServer(db, myUid, myUsername, name, isPrivate);
    msg.textContent = `Server created! Join code: ${result.joinCode}`;
    msg.style.color = "#4ade80";
    nameInput.value = "";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    publicBtn.disabled = false;
    privateBtn.disabled = false;
  }
}
on("create-public-btn", "click", () => handleCreateServer(false));
on("create-private-btn", "click", () => handleCreateServer(true));

on("join-server-btn", "click", async () => {
  const codeInput = document.getElementById("join-server-code");
  const msg = document.getElementById("server-modal-message");
  const code = codeInput.value.trim();
  if (!code) return;
  const joinBtn = document.getElementById("join-server-btn");
  joinBtn.disabled = true;
  msg.textContent = "Joining...";
  msg.style.color = "#8a8fa3";
  try {
    const result = await joinServerByCode(db, myUid, myUsername, code);
    msg.textContent = result.requested
      ? `Request sent to join "${result.serverName}"! Waiting for approval.`
      : `Joined "${result.serverName}"!`;
    msg.style.color = "#4ade80";
    codeInput.value = "";
    maybeShowJoinTagsModal(result);
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    joinBtn.disabled = false;
  }
});

on("close-channel-modal-btn", "click", () => {
  document.getElementById("channel-modal-backdrop").style.display = "none";
});

on("save-channel-btn", "click", async () => {
  if (!editingChannel) return;
  const newName = document.getElementById("edit-channel-name").value.trim();
  const checkbox = document.getElementById("edit-channel-allow-talk");
  const categoryId = document.getElementById("edit-channel-category").value || null;
  const updates = { categoryId };
  if (newName) updates.name = newName;
  if (editingChannel.channel.type === "general") updates.locked = !checkbox.checked;
  await updateChannel(db, editingChannel.server.id, editingChannel.channel.id, updates);
  document.getElementById("channel-modal-backdrop").style.display = "none";
});

on("delete-channel-btn", "click", async () => {
  if (!editingChannel) return;
  if (!confirm(`Delete #${editingChannel.channel.name}? This can't be undone.`)) return;
  await deleteChannelDoc(db, editingChannel.server.id, editingChannel.channel.id);
  document.getElementById("channel-modal-backdrop").style.display = "none";
  document.getElementById("main-area").innerHTML = `<div class="empty-main"><p>Channel deleted.</p></div>`;
  currentChat = null;
});

on("add-channel-btn", "click", () => {
  document.getElementById("new-channel-name").value = "";
  document.getElementById("new-channel-locked").checked = false;
  document.getElementById("new-channel-message").textContent = "";
  populateCategorySelect("new-channel-category", currentServer, null);
  document.getElementById("new-channel-modal-backdrop").style.display = "flex";
});

on("close-new-channel-modal-btn", "click", () => {
  document.getElementById("new-channel-modal-backdrop").style.display = "none";
});

on("create-channel-btn", "click", async () => {
  if (!currentServer) return;
  const name = document.getElementById("new-channel-name").value.trim();
  const msg = document.getElementById("new-channel-message");
  if (name.length < 2) {
    msg.textContent = "Channel name needs to be at least 2 characters.";
    msg.style.color = "#f87171";
    return;
  }
  const locked = document.getElementById("new-channel-locked").checked;
  const categoryId = document.getElementById("new-channel-category").value || null;
  const createBtn = document.getElementById("create-channel-btn");
  createBtn.disabled = true;
  msg.textContent = "Creating...";
  msg.style.color = "#8a8fa3";
  try {
    await createChannel(db, currentServer.id, name, locked, categoryId);
    document.getElementById("new-channel-modal-backdrop").style.display = "none";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    createBtn.disabled = false;
  }
});

on("add-category-btn", "click", () => {
  document.getElementById("new-category-name").value = "";
  document.getElementById("new-category-message").textContent = "";
  document.getElementById("new-category-modal-backdrop").style.display = "flex";
});

on("close-new-category-modal-btn", "click", () => {
  document.getElementById("new-category-modal-backdrop").style.display = "none";
});

on("create-category-btn", "click", async () => {
  if (!currentServer) return;
  const name = document.getElementById("new-category-name").value.trim();
  const msg = document.getElementById("new-category-message");
  if (name.length < 1) {
    msg.textContent = "Enter a category name.";
    msg.style.color = "#f87171";
    return;
  }
  try {
    await createCategory(db, currentServer.id, name);
    document.getElementById("new-category-modal-backdrop").style.display = "none";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  }
});

on("server-invite-btn", "click", () => {
  if (!currentServer) return;
  openInviteModal(currentServer);
});

on("close-invite-modal-btn", "click", () => {
  document.getElementById("invite-modal-backdrop").style.display = "none";
});

on("copy-invite-link-btn", "click", async () => {
  const input = document.getElementById("invite-link-input");
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    document.getElementById("invite-copy-message").textContent = "Link copied!";
    document.getElementById("invite-copy-message").style.color = "#4ade80";
  } catch (err) {
    document.getElementById("invite-copy-message").textContent = "Couldn't copy — long-press the link box to copy manually.";
    document.getElementById("invite-copy-message").style.color = "#f87171";
  }
});

function renderLiftsBar(server) {
  const lifts = server.lifts || 0;
  const filled = Math.min(lifts, 5);
  document.getElementById("lifts-bar-fill").style.width = `${(filled / 5) * 100}%`;
  document.getElementById("lifts-count-text").textContent = lifts > 5 ? `${lifts} Lifts` : `${lifts}/5 Lifts`;
  document.getElementById("apply-lift-btn").style.display = (myProfile.liftsAvailable || 0) > 0 ? "block" : "none";

  const bannerRow = document.getElementById("server-banner-image-row");
  const bannerLockedNote = document.getElementById("server-banner-locked-note");
  if (lifts >= 3) {
    bannerRow.style.display = "block";
    bannerLockedNote.style.display = "none";
  } else {
    bannerRow.style.display = "none";
    bannerLockedNote.style.display = "block";
  }
}

on("server-settings-btn", "click", () => {
  if (!currentServer) return;
  document.getElementById("server-settings-name").value = currentServer.name;
  document.getElementById("server-settings-private").checked = !!currentServer.isPrivate;
  selectedServerBannerColor = currentServer.bannerColor || "#0000ff";
  buildColorSwatches("server-banner-swatches", selectedServerBannerColor, (c) => { selectedServerBannerColor = c; });
  document.getElementById("server-banner-image-message").textContent = "";
  document.getElementById("server-tag-emoji").value = currentServer.tagEmoji || "";
  document.getElementById("server-tag-word").value = currentServer.tagWord || "";
  document.getElementById("server-joinable-tags").value = (currentServer.joinableTags || []).join(", ");
  document.getElementById("server-custom-code").value = "";
  document.getElementById("custom-code-message").textContent = "";
  document.getElementById("server-settings-message").textContent = "";
  renderLiftsBar(currentServer);
  editingServerIconUrl = currentServer.iconUrl || null;
  const iconPreview = document.getElementById("server-icon-preview");
  if (editingServerIconUrl) {
    iconPreview.style.backgroundImage = `url(${editingServerIconUrl})`;
    iconPreview.style.backgroundSize = "cover";
    iconPreview.style.backgroundPosition = "center";
    iconPreview.textContent = "";
  } else {
    iconPreview.style.backgroundImage = "none";
    iconPreview.style.backgroundColor = getAvatarColor(currentServer.name);
    iconPreview.textContent = getInitial(currentServer.name);
  }
  document.getElementById("server-icon-message").textContent = "";
  const featuredRow = document.getElementById("featured-toggle-row");
  if (isAdminUser()) {
    featuredRow.style.display = "flex";
    document.getElementById("server-settings-featured").checked = !!currentServer.featured;
  } else {
    featuredRow.style.display = "none";
  }
  document.getElementById("server-settings-modal-backdrop").style.display = "flex";
});

on("close-server-settings-btn", "click", () => {
  document.getElementById("server-settings-modal-backdrop").style.display = "none";
});

on("server-banner-random-btn", "click", () => {
  selectedServerBannerColor = randomBannerColor();
  buildColorSwatches("server-banner-swatches", selectedServerBannerColor, (c) => { selectedServerBannerColor = c; });
});

on("apply-lift-btn", "click", async () => {
  if (!currentServer) return;
  if (!confirm("Apply 1 of your Lifts to this server?")) return;
  try {
    await applyLiftToServer(db, currentServer.id, myUid, 1);
    myProfile = { ...myProfile, liftsAvailable: (myProfile.liftsAvailable || 0) - 1 };
    currentServer = { ...currentServer, lifts: (currentServer.lifts || 0) + 1 };
    renderLiftsBar(currentServer);
    showToast("Lift applied!");
  } catch (err) {
    alert(err.message);
  }
});

on("public-apply-lift-btn", "click", async () => {
  if (!currentServer) return;
  if (!confirm("Apply 1 of your Lifts to this server?")) return;
  try {
    await applyLiftToServer(db, currentServer.id, myUid, 1);
    myProfile = { ...myProfile, liftsAvailable: (myProfile.liftsAvailable || 0) - 1 };
    currentServer = { ...currentServer, lifts: (currentServer.lifts || 0) + 1 };
    renderPublicLifts(currentServer);
    showToast("Lift applied!");
  } catch (err) {
    alert(err.message);
  }
});

on("server-icon-upload-btn", "click", () => {
  document.getElementById("server-icon-file-input").click();
});

on("server-icon-file-input", "change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const msg = document.getElementById("server-icon-message");
  msg.textContent = "Uploading...";
  msg.style.color = "#8a8fa3";
  try {
    const url = await uploadProfileImage(file);
    editingServerIconUrl = url;
    const preview = document.getElementById("server-icon-preview");
    preview.style.backgroundImage = `url(${url})`;
    preview.style.backgroundSize = "cover";
    preview.style.backgroundPosition = "center";
    preview.textContent = "";
    msg.textContent = "Icon uploaded — hit Save to apply.";
    msg.style.color = "#4ade80";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  }
});

on("server-banner-image-btn", "click", () => {
  document.getElementById("server-banner-image-input").click();
});

on("server-banner-image-input", "change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentServer) return;
  const msg = document.getElementById("server-banner-image-message");
  msg.textContent = "Uploading...";
  msg.style.color = "#8a8fa3";
  try {
    const url = await uploadProfileImage(file);
    await updateServerSettings(db, currentServer.id, { bannerImageUrl: url });
    currentServer = { ...currentServer, bannerImageUrl: url };
    msg.textContent = "Banner image set!";
    msg.style.color = "#4ade80";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  }
});

on("save-server-settings-btn", "click", async () => {
  if (!currentServer) return;
  const name = document.getElementById("server-settings-name").value.trim();
  const msg = document.getElementById("server-settings-message");
  if (name.length < 2) {
    msg.textContent = "Server name needs to be at least 2 characters.";
    msg.style.color = "#f87171";
    return;
  }
  const isPrivate = document.getElementById("server-settings-private").checked;
  const tagEmoji = document.getElementById("server-tag-emoji").value.trim();
  const tagWord = document.getElementById("server-tag-word").value.trim().toUpperCase();
  const joinableTags = document.getElementById("server-joinable-tags").value.split(",").map((t) => t.trim()).filter(Boolean);

  if ((tagEmoji || tagWord) && (currentServer.lifts || 0) < 1) {
    msg.textContent = "Server tag needs at least 1 Lift.";
    msg.style.color = "#f87171";
    return;
  }

  const updates = { name, isPrivate, bannerColor: selectedServerBannerColor, tagEmoji, tagWord, iconUrl: editingServerIconUrl || null, joinableTags };
  if (isAdminUser()) {
    updates.featured = document.getElementById("server-settings-featured").checked;
  }
  const saveBtn = document.getElementById("save-server-settings-btn");
  saveBtn.disabled = true;
  msg.textContent = "Saving...";
  msg.style.color = "#8a8fa3";
  try {
    await updateServerSettings(db, currentServer.id, updates);
    currentServer = { ...currentServer, ...updates };
    renderServerHeader(currentServer, true);
    msg.textContent = "Saved!";
    msg.style.color = "#4ade80";
    setTimeout(() => {
      document.getElementById("server-settings-modal-backdrop").style.display = "none";
    }, 700);
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    saveBtn.disabled = false;
  }
});

on("set-custom-code-btn", "click", async () => {
  if (!currentServer) return;
  const code = document.getElementById("server-custom-code").value.trim();
  const msg = document.getElementById("custom-code-message");
  if (!code) return;
  if ((currentServer.lifts || 0) < 5) {
    msg.textContent = "Custom invite codes need 5 Lifts.";
    msg.style.color = "#f87171";
    return;
  }
  const btn = document.getElementById("set-custom-code-btn");
  btn.disabled = true;
  msg.textContent = "Setting...";
  msg.style.color = "#8a8fa3";
  try {
    const newCode = await setCustomJoinCode(db, currentServer.id, code);
    currentServer = { ...currentServer, joinCode: newCode };
    msg.textContent = `Invite code set to ${newCode}!`;
    msg.style.color = "#4ade80";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    btn.disabled = false;
  }
});

on("delete-server-btn", "click", async () => {
  if (!currentServer) return;
  if (!confirm(`Delete "${currentServer.name}" permanently? This removes all its channels and messages and can't be undone.`)) return;
  const btn = document.getElementById("delete-server-btn");
  const msg = document.getElementById("server-settings-message");
  btn.disabled = true;
  msg.textContent = "Deleting server...";
  msg.style.color = "#8a8fa3";
  try {
    await deleteServerEntirely(db, currentServer.id);
    document.getElementById("server-settings-modal-backdrop").style.display = "none";
    switchSidebarNav("friends");
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
    btn.disabled = false;
  }
});

on("server-leave-btn", "click", async () => {
  if (!currentServer) return;
  if (!confirm(`Leave "${currentServer.name}"?`)) return;
  try {
    await leaveServer(db, currentServer.id, myUid);
    switchSidebarNav("friends");
  } catch (err) {
    alert(err.message);
  }
});

// ---------- Roles & Members modal ----------

function renderRolesList() {
  const list = document.getElementById("roles-list");
  list.innerHTML = "";
  Object.entries(currentServer.roles || {}).forEach(([id, role]) => {
    const item = document.createElement("div");
    item.className = "role-row";
    item.innerHTML = `<span class="role-dot" style="background-color:${role.color};"></span><span class="role-name">${escapeHtml(role.name)}</span><button class="delete-role-btn">${ICONS.trash}</button>`;
    item.querySelector(".delete-role-btn").addEventListener("click", async () => {
      if (!confirm(`Delete role "${role.name}"?`)) return;
      await deleteRole(db, currentServer.id, id);
      renderRolesList();
    });
    list.appendChild(item);
  });
}

function renderMembersList() {
  const list = document.getElementById("members-list");
  list.innerHTML = "";
  Object.entries(currentServer.memberUsernames || {}).forEach(([uid, username]) => {
    const roleId = (currentServer.memberRoles || {})[uid];
    const timeoutUntil = (currentServer.timeouts || {})[uid];
    const isTimedOut = !!(timeoutUntil && timeoutUntil.toMillis && timeoutUntil.toMillis() > Date.now());
    const isOwnerRow = uid === currentServer.ownerUid;

    const item = document.createElement("div");
    item.className = "member-row";
    item.innerHTML = `
      <span class="member-name">${escapeHtml(username)}${isOwnerRow ? ' <span class="owner-tag">Owner</span>' : ""}</span>
      <select class="member-role-select"></select>
      ${!isOwnerRow ? `<button class="timeout-btn">${isTimedOut ? "Un-Timeout" : "Timeout 10m"}</button>` : ""}
    `;
    const select = item.querySelector(".member-role-select");
    select.innerHTML = `<option value="">No role</option>` +
      Object.entries(currentServer.roles || {}).map(([rid, r]) => `<option value="${rid}" ${rid === roleId ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("");
    select.addEventListener("change", async () => {
      await assignMemberRole(db, currentServer.id, uid, select.value || null);
    });
    if (!isOwnerRow) {
      item.querySelector(".timeout-btn").addEventListener("click", async () => {
        if (isTimedOut) await removeTimeout(db, currentServer.id, uid);
        else await timeoutMember(db, currentServer.id, uid, 10);
        renderMembersList();
      });
    }
    list.appendChild(item);
  });
}

on("open-roles-modal-btn", "click", () => {
  if (!currentServer) return;
  document.getElementById("server-settings-modal-backdrop").style.display = "none";
  document.querySelectorAll("#roles-modal-backdrop .settings-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector('[data-roles-tab="roles"]').classList.add("active");
  document.getElementById("roles-tab-panel").style.display = "block";
  document.getElementById("members-tab-panel").style.display = "none";
  selectedRoleColor = BANNER_COLORS[0];
  buildColorSwatches("new-role-color-swatches", selectedRoleColor, (c) => { selectedRoleColor = c; });
  document.getElementById("new-role-name").value = "";
  document.getElementById("perm-timeout").checked = false;
  document.getElementById("perm-delete-messages").checked = false;
  document.getElementById("perm-manage-channels").checked = false;
  document.getElementById("role-message").textContent = "";
  renderRolesList();
  renderMembersList();
  document.getElementById("roles-modal-backdrop").style.display = "flex";
});

on("close-roles-modal-btn", "click", () => {
  document.getElementById("roles-modal-backdrop").style.display = "none";
});

on("create-role-btn", "click", async () => {
  if (!currentServer) return;
  const name = document.getElementById("new-role-name").value.trim();
  const msg = document.getElementById("role-message");
  if (name.length < 1) {
    msg.textContent = "Enter a role name.";
    msg.style.color = "#f87171";
    return;
  }
  const perms = {
    timeout: document.getElementById("perm-timeout").checked,
    deleteMessages: document.getElementById("perm-delete-messages").checked,
    manageChannels: document.getElementById("perm-manage-channels").checked
  };
  try {
    await createRole(db, currentServer.id, name, selectedRoleColor, perms);
    document.getElementById("new-role-name").value = "";
    msg.textContent = "Role created!";
    msg.style.color = "#4ade80";
    renderRolesList();
    renderMembersList();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  }
});

function populateEquipTagSelect() {
  const select = document.getElementById("profile-equip-tag-select");
  select.innerHTML = `<option value="">None</option>`;
  myServers.filter((s) => s.tagWord).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.tagEmoji || ""}${s.tagWord} — ${s.name}`;
    if (myProfile.equippedTag && myProfile.equippedTag.serverId === s.id) opt.selected = true;
    select.appendChild(opt);
  });
}

function populateEquipCosmeticSelect() {
  const select = document.getElementById("equip-cosmetic-select");
  select.innerHTML = `<option value="">None</option>`;
  (myProfile.ownedCosmetics || []).forEach((itemId) => {
    const item = myShopItems.find((i) => i.id === itemId);
    if (!item) return;
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.name;
    if (myProfile.equippedEffect === item.id) opt.selected = true;
    select.appendChild(opt);
  });
}

on("my-profile-settings-btn", "click", () => {
  document.getElementById("profile-edit-bio").value = myProfile.bio || "";
  document.getElementById("profile-edit-gender").value = myProfile.gender || "";
  document.getElementById("profile-dm-privacy").value = myProfile.dmPrivacy || "friends";
  selectedProfileBannerColor = myProfile.bannerColor || "#0000ff";
  buildColorSwatches("profile-banner-swatches", selectedProfileBannerColor, (c) => { selectedProfileBannerColor = c; });
  populateEquipTagSelect();
  populateEquipCosmeticSelect();
  document.getElementById("profile-edit-message").textContent = "";
  document.getElementById("pfp-upload-message").textContent = "";
  renderPfpPreview();
  renderBlockedUsersList();
  document.getElementById("account-current-email").value = auth.currentUser ? auth.currentUser.email : "";
  document.getElementById("account-new-email").value = "";
  document.getElementById("account-new-password").value = "";
  document.getElementById("account-current-password").value = "";
  document.getElementById("account-edit-message").textContent = "";
  document.getElementById("delete-account-password").value = "";
  document.getElementById("delete-account-message").textContent = "";
  document.querySelectorAll("#settings-modal-backdrop .settings-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector('#settings-modal-backdrop [data-settings-tab="display"]').classList.add("active");
  document.getElementById("settings-display-panel").style.display = "block";
  document.getElementById("settings-account-panel").style.display = "none";
  document.getElementById("settings-security-panel").style.display = "none";
  document.getElementById("settings-modal-backdrop").style.display = "flex";
});

on("close-settings-btn", "click", () => {
  document.getElementById("settings-modal-backdrop").style.display = "none";
});

on("profile-banner-random-btn", "click", () => {
  selectedProfileBannerColor = randomBannerColor();
  buildColorSwatches("profile-banner-swatches", selectedProfileBannerColor, (c) => { selectedProfileBannerColor = c; });
});

on("pfp-upload-btn", "click", () => {
  document.getElementById("pfp-file-input").click();
});

on("pfp-file-input", "change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const msg = document.getElementById("pfp-upload-message");
  msg.textContent = "Uploading...";
  msg.style.color = "#8a8fa3";
  try {
    const url = await uploadProfileImage(file);
    await updateDoc(doc(db, "users", myUid), { pfpUrl: url });
    myProfile = { ...myProfile, pfpUrl: url };
    renderMyAvatar();
    renderPfpPreview();
    msg.textContent = "Photo updated!";
    msg.style.color = "#4ade80";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  }
});

on("save-profile-btn", "click", async () => {
  const bio = document.getElementById("profile-edit-bio").value.trim();
  const gender = document.getElementById("profile-edit-gender").value.trim();
  const dmPrivacy = document.getElementById("profile-dm-privacy").value;
  const selectedServerId = document.getElementById("profile-equip-tag-select").value;
  const equippedEffect = document.getElementById("equip-cosmetic-select").value || null;
  const msg = document.getElementById("profile-edit-message");
  const saveBtn = document.getElementById("save-profile-btn");
  saveBtn.disabled = true;
  msg.textContent = "Saving...";
  msg.style.color = "#8a8fa3";

  let equippedTag = null;
  if (selectedServerId) {
    const s = myServers.find((sv) => sv.id === selectedServerId);
    if (s) equippedTag = { serverId: s.id, tagEmoji: s.tagEmoji || "", tagWord: s.tagWord || "", joinCode: s.joinCode };
  }

  try {
    await updateDoc(doc(db, "users", myUid), { bio, gender, bannerColor: selectedProfileBannerColor, equippedTag, dmPrivacy, equippedEffect });
    myProfile = { ...myProfile, bio, gender, bannerColor: selectedProfileBannerColor, equippedTag, dmPrivacy, equippedEffect };
    renderMyBadgeRow();
    renderMyAvatar();
    msg.textContent = "Saved!";
    msg.style.color = "#4ade80";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    saveBtn.disabled = false;
  }
});

on("save-account-btn", "click", async () => {
  const newEmail = document.getElementById("account-new-email").value.trim();
  const newPassword = document.getElementById("account-new-password").value;
  const currentPassword = document.getElementById("account-current-password").value;
  const msg = document.getElementById("account-edit-message");

  if (!newEmail && !newPassword) {
    msg.textContent = "Enter a new email or new password to change something.";
    msg.style.color = "#f87171";
    return;
  }
  if (!currentPassword) {
    msg.textContent = "Enter your current password to confirm.";
    msg.style.color = "#f87171";
    return;
  }
  if (newPassword && newPassword.length < 6) {
    msg.textContent = "New password needs to be at least 6 characters.";
    msg.style.color = "#f87171";
    return;
  }

  const saveBtn = document.getElementById("save-account-btn");
  saveBtn.disabled = true;
  msg.textContent = "Saving...";
  msg.style.color = "#8a8fa3";

  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);

    if (newEmail && newEmail !== auth.currentUser.email) {
      await updateEmail(auth.currentUser, newEmail);
      document.getElementById("account-current-email").value = newEmail;
    }
    if (newPassword) {
      await updatePassword(auth.currentUser, newPassword);
    }

    document.getElementById("account-new-email").value = "";
    document.getElementById("account-new-password").value = "";
    document.getElementById("account-current-password").value = "";
    msg.textContent = "Account updated!";
    msg.style.color = "#4ade80";
  } catch (err) {
    if (err.code === "auth/wrong-password") {
      msg.textContent = "That current password is incorrect.";
    } else if (err.code === "auth/requires-recent-login") {
      msg.textContent = "For security, please log out and back in, then try again.";
    } else {
      msg.textContent = err.message;
    }
    msg.style.color = "#f87171";
  } finally {
    saveBtn.disabled = false;
  }
});

on("delete-account-btn", "click", async () => {
  const password = document.getElementById("delete-account-password").value;
  const msg = document.getElementById("delete-account-message");
  if (!password) {
    msg.textContent = "Enter your current password to confirm.";
    msg.style.color = "#f87171";
    return;
  }
  if (!confirm("This permanently deletes your account. Are you sure?")) return;

  const btn = document.getElementById("delete-account-btn");
  btn.disabled = true;
  msg.textContent = "Deleting...";
  msg.style.color = "#8a8fa3";
  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await deleteDoc(doc(db, "users", myUid));
    await deleteUser(auth.currentUser);
    window.location.href = "login.html";
  } catch (err) {
    if (err.code === "auth/wrong-password") {
      msg.textContent = "That password is incorrect.";
    } else {
      msg.textContent = err.message;
    }
    msg.style.color = "#f87171";
    btn.disabled = false;
  }
});

// ---------- Calls ----------

function openCallOverlay(roomName, titleText) {
  document.getElementById("call-overlay-title").textContent = titleText ? `Call with ${titleText}` : "Call";
  document.getElementById("call-iframe").src = `https://meet.jit.si/${roomName}#config.prejoinPageEnabled=false&config.disableDeepLinking=true`;
  document.getElementById("call-overlay").style.display = "flex";
}

function startCall(friend) {
  const roomName = `larpcord-${friendshipId(myUid, friend.uid)}-${Date.now()}`;
  openCallOverlay(roomName, friend.username);
  sendMessage(db, currentChat.pathSegments, myUid, myUsername, "", null, null, currentChat.recipientUid || null, null, null, { room: roomName });
}

on("close-call-overlay-btn", "click", () => {
  document.getElementById("call-overlay").style.display = "none";
  document.getElementById("call-iframe").src = "";
});
