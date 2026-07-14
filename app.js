import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { getAvatarColor, getInitial } from './avatar.js';
import { sendFriendRequest, listenForIncomingRequests, acceptFriendRequest, declineFriendRequest, listenForFriends, friendshipId } from './friends.js';
import { listenForMessages, sendMessage, toggleReaction, markAsRead } from './messages.js';
import { searchGifs } from './giphy.js';
import { createServer, joinServerByCode, listenForMyServers, listenForJoinRequests, approveJoinRequest, declineJoinRequest, listenForChannels, updateChannel, deleteChannelDoc, createChannel, updateServerSettings, markChannelRead, clearServerMentions } from './servers.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let myUid = null;
let myUsername = null;
let myProfile = {};
let myFriends = [];
let currentChat = null;
let currentServer = null;
let editingChannel = null;
let currentMessagesUnsubscribe = null;
let currentChannelsUnsubscribe = null;
let currentJoinRequestsUnsubscribe = null;
let replyingTo = null;
let gifSearchTimeout = null;
let selectedServerBannerColor = null;
let selectedProfileBannerColor = null;

const EMOJI_LIST = ["😀","😂","😍","😎","🥳","😢","😡","👍","👎","❤️","🔥","🎉","💀","😭","🙏","👀","😅","🤔","😴","🤯","💯","✨","🫡","😤"];
const QUICK_REACTIONS = ["👍","❤️","😂","😮","😢","🔥"];
const BANNER_COLORS = ["#0000ff", "#5b3df5", "#2e7dff", "#ef4444", "#f59e0b", "#4ade80", "#ec4899", "#14b8a6"];

const ICONS = {
  smile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
  addReaction: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
  reply: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`,
  gear: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  share: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`,
  lock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
  power: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>`
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
  setIcon("server-invite-btn", ICONS.share);
  setIcon("server-settings-btn", ICONS.gear);
  setIcon("my-profile-settings-btn", ICONS.gear);
  setIcon("logout-btn", ICONS.power);
}
applyStaticIcons();

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
    item.querySelector(".avatar-circle").addEventListener("click", (e) => {
      e.stopPropagation();
      openProfileView(friend.uid, friend.username);
    });
    item.addEventListener("click", () => openChat(friend));
    list.appendChild(item);
  });
}

function renderServerRail(servers) {
  const rail = document.getElementById("server-list");
  rail.innerHTML = "";
  servers.forEach((server) => {
    const wrapper = document.createElement("div");
    wrapper.className = "rail-icon-wrapper";

    const icon = document.createElement("div");
    icon.className = "rail-icon server-icon";
    icon.textContent = getInitial(server.name);
    icon.title = server.name;
    icon.addEventListener("click", () => selectServer(server));
    wrapper.appendChild(icon);

    const mentionCount = (server.mentions && server.mentions[myUid]) || 0;
    if (mentionCount > 0) {
      const badge = document.createElement("span");
      badge.className = "rail-badge";
      badge.textContent = mentionCount > 9 ? "9+" : mentionCount;
      wrapper.appendChild(badge);
    }

    rail.appendChild(wrapper);
  });
}

function renderServerHeader(server, isOwner) {
  const iconEl = document.getElementById("server-header-icon");
  iconEl.textContent = getInitial(server.name);
  iconEl.style.backgroundColor = getAvatarColor(server.name);
  document.getElementById("server-view-name").textContent = server.name;
  const count = server.members ? server.members.length : 1;
  document.getElementById("server-view-count").textContent = `${count} player${count === 1 ? "" : "s"}`;
  document.getElementById("server-banner").style.backgroundColor = server.bannerColor || "#0000ff";
  document.getElementById("server-settings-btn").style.display = isOwner ? "flex" : "none";
}

function selectServer(server) {
  currentServer = server;
  document.getElementById("friends-view").style.display = "none";
  document.getElementById("server-view").style.display = "block";

  const isOwner = server.ownerUid === myUid;
  renderServerHeader(server, isOwner);
  document.getElementById("add-channel-btn").style.display = isOwner ? "flex" : "none";

  if ((server.mentions && server.mentions[myUid]) > 0) {
    clearServerMentions(db, server.id, myUid);
  }

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
    item.innerHTML = `<span>${escapeHtml(req.username)}</span><div class="request-buttons"><button class="accept-btn">✓</button><button class="decline-btn">✕</button></div>`;
    item.querySelector(".accept-btn").addEventListener("click", () => approveJoinRequest(db, server.id, req.uid, req.username));
    item.querySelector(".decline-btn").addEventListener("click", () => declineJoinRequest(db, server.id, req.uid));
    list.appendChild(item);
  });
}

function openChannelSettings(server, channel) {
  editingChannel = { server, channel };
  document.getElementById("edit-channel-name").value = channel.name;
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
  const emojis = Object.keys(reactions).filter((e) => reactions[e] && reactions[e].length > 0);
  if (emojis.length === 0) return "";

  const pills = emojis.map((emoji) => {
    const count = reactions[emoji].length;
    const mine = reactions[emoji].includes(myUid) ? "mine" : "";
    return `<span class="reaction-pill ${mine}" data-msg-id="${msg.id}" data-emoji="${emoji}">${emoji} ${count}</span>`;
  }).join("");

  return `<div class="reactions-row">${pills}</div>`;
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

  const contentHtml = msg.invite
    ? renderInviteCard(msg)
    : msg.gifUrl
    ? `<img class="message-gif" src="${msg.gifUrl}">`
    : `<p class="message-text">${renderTextWithMentions(msg.text)}</p>`;

  return `
    <div class="message-line">
      ${replyHtml}
      ${contentHtml}
      <span class="message-actions">
        <button class="react-btn" data-msg-id="${msg.id}">${ICONS.addReaction}</button>
        <button class="reply-btn" data-msg-id="${msg.id}" data-sender="${escapeHtml(msg.senderUsername)}" data-text="${escapeHtml(msg.text || (msg.gifUrl ? 'a GIF' : (msg.invite ? 'a server invite' : '')))}">${ICONS.reply}</button>
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

    row.innerHTML = `
      <div class="avatar-circle msg-avatar" style="background-color:${getAvatarColor(group.senderUsername)}">${getInitial(group.senderUsername)}</div>
      <div class="message-content">
        <span class="message-sender">${escapeHtml(group.senderUsername)}<span class="message-time">${formatTime(group.firstTime)}</span></span>
        ${linesHtml}
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll(".react-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = document.getElementById("quick-" + btn.dataset.msgId);
      el.style.display = el.style.display === "none" ? "flex" : "none";
    });
  });

  list.querySelectorAll(".quick-react").forEach((el) => {
    el.addEventListener("click", () => {
      toggleReaction(db, currentChat.pathSegments, el.dataset.msgId, el.dataset.emoji, myUid);
      el.parentElement.style.display = "none";
    });
  });

  list.querySelectorAll(".reaction-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      toggleReaction(db, currentChat.pathSegments, pill.dataset.msgId, pill.dataset.emoji, myUid);
    });
  });

  list.querySelectorAll(".reply-btn").forEach((btn) => {
    btn.addEventListener("click", () => startReply(btn.dataset.msgId, btn.dataset.sender, btn.dataset.text));
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

function renderComposerHTML(canWrite, placeholder) {
  if (!canWrite) {
    return `<div class="readonly-banner">${ICONS.lock} Only the owner can post in this channel</div>`;
  }
  return `
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
  replyingTo = null;
  const fsId = friendshipId(myUid, friend.uid);
  currentChat = { type: "dm", pathSegments: ["friendships", fsId], recipientUid: friend.uid };
  markAsRead(db, fsId, myUid);

  document.getElementById("main-area").innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <div class="avatar-circle small-avatar clickable-profile" id="chat-header-avatar" style="background-color:${getAvatarColor(friend.username)}">${getInitial(friend.username)}</div>
        <span class="chat-username clickable-profile" id="chat-header-username">${escapeHtml(friend.username)}</span>
      </div>
      <div class="messages-list" id="messages-list"></div>
      ${renderComposerHTML(true, `Message @${escapeHtml(friend.username)}`)}
    </div>
  `;

  document.getElementById("chat-header-avatar").addEventListener("click", () => openProfileView(friend.uid, friend.username));
  document.getElementById("chat-header-username").addEventListener("click", () => openProfileView(friend.uid, friend.username));

  if (currentMessagesUnsubscribe) currentMessagesUnsubscribe();
  currentMessagesUnsubscribe = listenForMessages(db, currentChat.pathSegments, renderMessages);
  attachComposerListeners(true);
}

function openChannel(server, channel) {
  const isOwner = server.ownerUid === myUid;
  const canWrite = isOwner || (channel.type === "general" && !channel.locked);
  replyingTo = null;
  currentChat = { type: "channel", pathSegments: ["servers", server.id, "channels", channel.id], canWrite, serverId: server.id, channelId: channel.id };

  markChannelRead(db, server.id, channel.id, myUid);

  document.getElementById("main-area").innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <span class="chat-username">#${escapeHtml(channel.name)}</span>
      </div>
      <div class="messages-list" id="messages-list"></div>
      ${renderComposerHTML(canWrite, `Message #${escapeHtml(channel.name)}`)}
    </div>
  `;

  if (currentMessagesUnsubscribe) currentMessagesUnsubscribe();
  currentMessagesUnsubscribe = listenForMessages(db, currentChat.pathSegments, renderMessages);
  attachComposerListeners(canWrite);
}

function sendCurrentMessage() {
  const input = document.getElementById("message-input");
  const text = input.value;
  if (!text.trim() || !currentChat) return;

  let channelMeta = null;
  if (currentChat.type === "channel" && currentServer) {
    const members = Object.entries(currentServer.memberUsernames || {}).map(([uid, username]) => ({ uid, username }));
    channelMeta = { serverId: currentChat.serverId, channelId: currentChat.channelId, members };
  }

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

async function openProfileView(uid, fallbackUsername) {
  const modal = document.getElementById("profile-view-modal-backdrop");
  document.getElementById("profile-view-username").textContent = fallbackUsername;
  document.getElementById("profile-view-avatar").textContent = getInitial(fallbackUsername);
  document.getElementById("profile-view-avatar").style.backgroundColor = getAvatarColor(fallbackUsername);
  document.getElementById("profile-view-banner").style.backgroundColor = "#2a2a33";
  document.getElementById("profile-view-bio").textContent = "Loading...";
  document.getElementById("profile-view-gender").textContent = "Loading...";
  modal.style.display = "flex";

  try {
    const data = uid === myUid ? myProfile : (await getDoc(doc(db, "users", uid))).data() || {};
    document.getElementById("profile-view-banner").style.backgroundColor = data.bannerColor || "#0000ff";
    document.getElementById("profile-view-bio").textContent = data.bio && data.bio.trim() ? data.bio : "No bio yet.";
    document.getElementById("profile-view-gender").textContent = data.gender && data.gender.trim() ? data.gender : "Not specified";
  } catch (err) {
    document.getElementById("profile-view-bio").textContent = "Couldn't load profile.";
    document.getElementById("profile-view-gender").textContent = "";
  }
}

on("close-profile-view-btn", "click", () => {
  document.getElementById("profile-view-modal-backdrop").style.display = "none";
});

on("my-avatar", "click", () => openProfileView(myUid, myUsername));

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

on("rail-home-btn", "click", showFriendsView);

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

document.querySelectorAll(".settings-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.settingsTab;
    document.getElementById("settings-display-panel").style.display = target === "display" ? "block" : "none";
    document.getElementById("settings-account-panel").style.display = target === "account" ? "block" : "none";
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
  const updates = {};
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
  const createBtn = document.getElementById("create-channel-btn");
  createBtn.disabled = true;
  msg.textContent = "Creating...";
  msg.style.color = "#8a8fa3";
  try {
    await createChannel(db, currentServer.id, name, locked);
    document.getElementById("new-channel-modal-backdrop").style.display = "none";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    createBtn.disabled = false;
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

on("server-settings-btn", "click", () => {
  if (!currentServer) return;
  document.getElementById("server-settings-name").value = currentServer.name;
  document.getElementById("server-settings-private").checked = !!currentServer.isPrivate;
  selectedServerBannerColor = currentServer.bannerColor || "#0000ff";
  buildColorSwatches("server-banner-swatches", selectedServerBannerColor, (c) => { selectedServerBannerColor = c; });
  document.getElementById("server-settings-message").textContent = "";
  document.getElementById("server-settings-modal-backdrop").style.display = "flex";
});

on("close-server-settings-btn", "click", () => {
  document.getElementById("server-settings-modal-backdrop").style.display = "none";
});

on("server-banner-random-btn", "click", () => {
  selectedServerBannerColor = randomBannerColor();
  buildColorSwatches("server-banner-swatches", selectedServerBannerColor, (c) => { selectedServerBannerColor = c; });
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
  const saveBtn = document.getElementById("save-server-settings-btn");
  saveBtn.disabled = true;
  msg.textContent = "Saving...";
  msg.style.color = "#8a8fa3";
  try {
    await updateServerSettings(db, currentServer.id, { name, isPrivate, bannerColor: selectedServerBannerColor });
    currentServer = { ...currentServer, name, isPrivate, bannerColor: selectedServerBannerColor };
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

on("my-profile-settings-btn", "click", () => {
  document.getElementById("profile-edit-bio").value = myProfile.bio || "";
  document.getElementById("profile-edit-gender").value = myProfile.gender || "";
  selectedProfileBannerColor = myProfile.bannerColor || "#0000ff";
  buildColorSwatches("profile-banner-swatches", selectedProfileBannerColor, (c) => { selectedProfileBannerColor = c; });
  document.getElementById("profile-edit-message").textContent = "";
  document.getElementById("account-current-email").value = auth.currentUser ? auth.currentUser.email : "";
  document.getElementById("account-new-email").value = "";
  document.getElementById("account-new-password").value = "";
  document.getElementById("account-current-password").value = "";
  document.getElementById("account-edit-message").textContent = "";
  document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector('[data-settings-tab="display"]').classList.add("active");
  document.getElementById("settings-display-panel").style.display = "block";
  document.getElementById("settings-account-panel").style.display = "none";
  document.getElementById("settings-modal-backdrop").style.display = "flex";
});

on("close-settings-btn", "click", () => {
  document.getElementById("settings-modal-backdrop").style.display = "none";
});

on("profile-banner-random-btn", "click", () => {
  selectedProfileBannerColor = randomBannerColor();
  buildColorSwatches("profile-banner-swatches", selectedProfileBannerColor, (c) => { selectedProfileBannerColor = c; });
});

on("save-profile-btn", "click", async () => {
  const bio = document.getElementById("profile-edit-bio").value.trim();
  const gender = document.getElementById("profile-edit-gender").value;
  const msg = document.getElementById("profile-edit-message");
  const saveBtn = document.getElementById("save-profile-btn");
  saveBtn.disabled = true;
  msg.textContent = "Saving...";
  msg.style.color = "#8a8fa3";
  try {
    await updateDoc(doc(db, "users", myUid), { bio, gender, bannerColor: selectedProfileBannerColor });
    myProfile = { ...myProfile, bio, gender, bannerColor: selectedProfileBannerColor };
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
    msg.textContent = "Enter your current password to confirm changes.";
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
