import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { getAvatarColor, getInitial } from './avatar.js';
import { sendFriendRequest, listenForIncomingRequests, acceptFriendRequest, declineFriendRequest, listenForFriends, friendshipId } from './friends.js';
import { listenForMessages, sendMessage, toggleReaction, markAsRead } from './messages.js';
import { searchGifs } from './giphy.js';
import { createServer, joinServerByCode, listenForMyServers, listenForJoinRequests, approveJoinRequest, declineJoinRequest, listenForChannels, updateChannel, deleteChannelDoc, createChannel } from './servers.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let myUid = null;
let myUsername = null;
let myFriends = [];
let currentChat = null;
let currentServer = null;
let editingChannel = null;
let currentMessagesUnsubscribe = null;
let currentChannelsUnsubscribe = null;
let currentJoinRequestsUnsubscribe = null;
let replyingTo = null;
let gifSearchTimeout = null;

const EMOJI_LIST = ["😀","😂","😍","😎","🥳","😢","😡","👍","👎","❤️","🔥","🎉","💀","😭","🙏","👀","😅","🤔","😴","🤯","💯","✨","🫡","😤"];
const QUICK_REACTIONS = ["👍","❤️","😂","😮","😢","🔥"];

const ICONS = {
  smile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
  addReaction: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
  reply: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`,
  gear: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
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

function getJoinLinkForCode(code) {
  return `${window.location.origin}${window.location.pathname}?join=${code}`;
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

  document.getElementById("my-username").textContent = myUsername;
  const avatarEl = document.getElementById("my-avatar");
  avatarEl.textContent = getInitial(myUsername);
  avatarEl.style.backgroundColor = getAvatarColor(myUsername);

  listenForIncomingRequests(db, myUid, renderRequests);
  listenForFriends(db, myUid, renderFriends);
  listenForMyServers(db, myUid, renderServerRail);

  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get("join");
  if (joinCode) {
    window.history.replaceState({}, "", window.location.pathname);
    try {
      const result = await joinServerByCode(db, myUid, myUsername, joinCode);
      alert(result.requested
        ? `Request sent to join "${result.serverName}"! Waiting for approval.`
        : `Joined "${result.serverName}"!`);
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
    item.innerHTML = `<div class="avatar-circle small-avatar" style="background-color:${getAvatarColor(friend.username)}">${getInitial(friend.username)}</div><span class="friend-name">${escapeHtml(friend.username)}</span>${badge}`;
    item.addEventListener("click", () => openChat(friend));
    list.appendChild(item);
  });
}

function renderServerRail(servers) {
  const rail = document.getElementById("server-list");
  rail.innerHTML = "";
  servers.forEach((server) => {
    const icon = document.createElement("div");
    icon.className = "rail-icon server-icon";
    icon.textContent = getInitial(server.name);
    icon.title = server.name;
    icon.addEventListener("click", () => selectServer(server));
    rail.appendChild(icon);
  });
}

function renderServerHeader(server) {
  const iconEl = document.getElementById("server-header-icon");
  iconEl.textContent = getInitial(server.name);
  iconEl.style.backgroundColor = getAvatarColor(server.name);
  document.getElementById("server-view-name").textContent = server.name;
  const count = server.members ? server.members.length : 1;
  document.getElementById("server-view-count").textContent = `${count} player${count === 1 ? "" : "s"}`;
}

function selectServer(server) {
  currentServer = server;
  document.getElementById("friends-view").style.display = "none";
  document.getElementById("server-view").style.display = "block";

  const isOwner = server.ownerUid === myUid;
  renderServerHeader(server);
  document.getElementById("add-channel-btn").style.display = isOwner ? "flex" : "none";

  if (currentChannelsUnsubscribe) currentChannelsUnsubscribe();
  currentChannelsUnsubscribe = listenForChannels(db, server.id, (channels) => renderChannelList(server, channels, isOwner));

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
}

function showFriendsView() {
  currentServer = null;
  if (currentChannelsUnsubscribe) { currentChannelsUnsubscribe(); currentChannelsUnsubscribe = null; }
  if (currentJoinRequestsUnsubscribe) { currentJoinRequestsUnsubscribe(); currentJoinRequestsUnsubscribe = null; }
  document.getElementById("server-view").style.display = "none";
  document.getElementById("friends-view").style.display = "block";
  document.getElementById("main-area").innerHTML = `
    <div class="empty-main">
      <div class="empty-logo">Larpcord</div>
      <p>Add friends to start chatting</p>
    </div>
  `;
  currentChat = null;
  if (currentMessagesUnsubscribe) { currentMessagesUnsubscribe(); currentMessagesUnsubscribe = null; }
}

function renderChannelList(server, channels, isOwner) {
  const list = document.getElementById("channel-list");
  list.innerHTML = "";

  channels.filter((ch) => ch.type !== "mod" || isOwner).forEach((ch) => {
    const item = document.createElement("div");
    item.className = "channel-item";
    const gearHtml = isOwner ? `<button class="channel-gear-btn">${ICONS.gear}</button>` : "";
    item.innerHTML = `<span class="channel-hash">#</span><span class="channel-name-text">${escapeHtml(ch.name)}</span>${gearHtml}`;
    item.querySelector(".channel-name-text").addEventListener("click", () => openChannel(server, ch));
    item.querySelector(".channel-hash").addEventListener("click", () => openChannel(server, ch));
    const gearBtn = item.querySelector(".channel-gear-btn");
    if (gearBtn) {
      gearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openChannelSettings(server, ch);
      });
    }
    list.appendChild(item);
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
    item.innerHTML = `<span>${escapeHtml(req.username)}</span><div class="request-buttons"><button class="accept-btn">✓</button><button class="decline-btn">✕</button>
