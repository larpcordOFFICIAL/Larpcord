import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { getAvatarColor, getInitial } from './avatar.js';
import { sendFriendRequest, listenForIncomingRequests, acceptFriendRequest, declineFriendRequest, listenForFriends, friendshipId } from './friends.js';
import { listenForMessages, sendMessage, toggleReaction, markAsRead } from './messages.js';
import { searchGifs } from './giphy.js';
import { createServer, joinServerByCode, listenForMyServers, listenForJoinRequests, approveJoinRequest, declineJoinRequest, listenForChannels, updateChannel, deleteChannelDoc } from './servers.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let myUid = null;
let myUsername = null;
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
});

/* ---------- Friends ---------- */

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

/* ---------- Servers ---------- */

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

function selectServer(server) {
  currentServer = server;
  document.getElementById("friends-view").style.display = "none";
  document.getElementById("server-view").style.display = "block";
  document.getElementById("server-view-name").textContent = server.name;

  const isOwner = server.ownerUid === myUid;

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

  requests.forEach((req) => {
    const item = document.createElement("div");
    item.className = "request-item";
    item.innerHTML = `<span>${escapeHtml(req.username)}</span><div class="request-buttons"><button class="accept-btn">✓</button><button class="decline-btn">✕</button></div>`;
    item.querySelector(".accept-btn").addEventListener("click", () => approveJoinRequest(db, server.id, req.uid));
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

/* ---------- Shared chat rendering (DMs + Channels) ---------- */

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

function renderSingleMessage(msg) {
  const replyHtml = msg.replyTo
    ? `<div class="reply-quote">${ICONS.reply} ${escapeHtml(msg.replyTo.senderUsername)}: ${escapeHtml(msg.replyTo.text)}</div>`
    : "";

  const quickHtml = QUICK_REACTIONS.map((e) => `<span class="emoji-option quick-react" data-msg-id="${msg.id}" data-emoji="${e}">${e}</span>`).join("");

  const contentHtml = msg.gifUrl
    ? `<img class="message-gif" src="${msg.gifUrl}">`
    : `<p class="message-text">${renderTextWithMentions(msg.text)}</p>`;

  return `
    <div class="message-line">
      ${replyHtml}
      ${contentHtml}
      <span class="message-actions">
        <button class="react-btn" data-msg-id="${msg.id}">${ICONS.addReaction}</button>
        <button class="reply-btn" data-msg-id="${msg.id}" data-sender="${escapeHtml(msg.senderUsername)}" data-text="${escapeHtml(msg.text || (msg.gifUrl ? 'a GIF' : ''))}">${ICONS.reply}</button>
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
    return `<div class="readonly-banner">🔒 Only the owner can post in this channel</div>`;
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

/* ---------- DMs ---------- */

function openChat(friend) {
  replyingTo = null;
  const fsId = friendshipId(myUid, friend.uid);
  currentChat = { type: "dm", pathSegments: ["friendships", fsId], recipientUid: friend.uid };
  markAsRead(db, fsId, myUid);

  document.getElementById("main-area").innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <div class="avatar-circle small-avatar" style="background-color:${getAvatarColor(friend.username)}">${getInitial(friend.username)}</div>
        <span class="chat-username">${escapeHtml(friend.username)}</span>
      </div>
      <div class="messages-list" id="messages-list"></div>
      ${renderComposerHTML(true, `Message @${escapeHtml(friend.username)}`)}
    </div>
  `;

  if (currentMessagesUnsubscribe) currentMessagesUnsubscribe();
  currentMessagesUnsubscribe = listenForMessages(db, currentChat.pathSegments, renderMessages);
  attachComposerListeners(true);
}

/* ---------- Channels ---------- */

function openChannel(server, channel) {
  const isOwner = server.ownerUid === myUid;
  const canWrite = isOwner || (channel.type === "general" && !channel.locked);
  replyingTo = null;
  currentChat = { type: "channel", pathSegments: ["servers", server.id, "channels", channel.id], canWrite };

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
  sendMessage(db, currentChat.pathSegments, myUid, myUsername, text, replyingTo, null, currentChat.recipientUid || null);
  input.value = "";
  replyingTo = null;
  renderReplyPreview();
}

/* ---------- Top-level buttons & modals ---------- */

document.getElementById("add-friend-btn").addEventListener("click", async () => {
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

document.getElementById("logout-btn").addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "login.html");
});

document.getElementById("rail-home-btn").addEventListener("click", showFriendsView);

document.getElementById("rail-add-btn").addEventListener("click", () => {
  document.getElementById("server-modal-backdrop").style.display = "flex";
});
document.getElementById("close-server-modal-btn").addEventListener("click", () => {
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

async function handleCreateServer(isPrivate) {
  const nameInput = document.getElementById("new-server-name");
  const msg = document.getElementById("server-modal-message");
  const name = nameInput.value.trim();
  if (name.length < 2) {
    msg.textContent = "Server name needs to be at least 2 characters.";
    msg.style.color = "#f87171";
    return;
  }
  try {
    const result = await createServer(db, myUid, myUsername, name, isPrivate);
    msg.textContent = `Server created! Join code: ${result.joinCode}`;
    msg.style.color = "#4ade80";
    nameInput.value = "";
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  }
}
document.getElementById("create-public-btn").addEventListener("click", () => handleCreateServer(false));
document.getElementById("create-private-btn").addEventListener("click", () => handleCreateServer(true));

document.getElementById("join-server-btn").addEventListener("click", async () => {
  const codeInput = document.getElementById("join-server-code");
  const msg = document.getElementById("server-modal-message");
  const code = codeInput.value.trim();
  if (!code) return;
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
  }
});

document.getElementById("close-channel-modal-btn").addEventListener("click", () => {
  document.getElementById("channel-modal-backdrop").style.display = "none";
});

document.getElementById("save-channel-btn").addEventListener("click", async () => {
  if (!editingChannel) return;
  const newName = document.getElementById("edit-channel-name").value.trim();
  const checkbox = document.getElementById("edit-channel-allow-talk");
  const updates = {};
  if (newName) updates.name = newName;
  if (editingChannel.channel.type === "general") updates.locked = !checkbox.checked;
  await updateChannel(db, editingChannel.server.id, editingChannel.channel.id, updates);
  document.getElementById("channel-modal-backdrop").style.display = "none";
});

document.getElementById("delete-channel-btn").addEventListener("click", async () => {
  if (!editingChannel) return;
  if (!confirm(`Delete #${editingChannel.channel.name}? This can't be undone.`)) return;
  await deleteChannelDoc(db, editingChannel.server.id, editingChannel.channel.id);
  document.getElementById("channel-modal-backdrop").style.display = "none";
  document.getElementById("main-area").innerHTML = `<div class="empty-main"><p>Channel deleted.</p></div>`;
  currentChat = null;
});
