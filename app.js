import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { getAvatarColor, getInitial } from './avatar.js';
import { sendFriendRequest, listenForIncomingRequests, acceptFriendRequest, declineFriendRequest, listenForFriends, friendshipId } from './friends.js';
import { listenForMessages, sendMessage, toggleReaction } from './messages.js';
import { searchGifs } from './giphy.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let myUid = null;
let myUsername = null;
let currentFriend = null;
let currentMessagesUnsubscribe = null;
let replyingTo = null;
let gifSearchTimeout = null;

const EMOJI_LIST = ["😀","😂","😍","😎","🥳","😢","😡","👍","👎","❤️","🔥","🎉","💀","😭","🙏","👀","😅","🤔","😴","🤯","💯","✨","🫡","😤"];
const QUICK_REACTIONS = ["👍","❤️","😂","😮","😢","🔥"];

const ICONS = {
  smile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
  addReaction: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
  reply: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`
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
});

function renderRequests(requests) {
  const section = document.getElementById("requests-section");
  const list = document.getElementById("requests-list");
  list.innerHTML = "";

  if (requests.length === 0) {
    section.style.display = "none";
    return;
  }
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
    item.innerHTML = `<div class="avatar-circle small-avatar" style="background-color:${getAvatarColor(friend.username)}">${getInitial(friend.username)}</div><span>${escapeHtml(friend.username)}</span>`;
    item.addEventListener("click", () => openChat(friend));
    list.appendChild(item);
  });
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
      groups.push({
        senderId: msg.senderId,
        senderUsername: msg.senderUsername,
        firstTime: msg.createdAt,
        lastTime: msgTime,
        messages: [msg]
      });
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
      toggleReaction(db, friendshipId(myUid, currentFriend.uid), el.dataset.msgId, el.dataset.emoji, myUid);
      el.parentElement.style.display = "none";
    });
  });

  list.querySelectorAll(".reaction-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      toggleReaction(db, friendshipId(myUid, currentFriend.uid), pill.dataset.msgId, pill.dataset.emoji, myUid);
    });
  });

  list.querySelectorAll(".reply-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      startReply(btn.dataset.msgId, btn.dataset.sender, btn.dataset.text);
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
  input.focus();
}

function cancelReply() {
  replyingTo = null;
  renderReplyPreview();
}

function renderReplyPreview() {
  const container = document.getElementById("reply-preview-container");
  if (!container) return;
  if (!replyingTo) {
    container.innerHTML = "";
    return;
  }
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
  if (!currentFriend) return;
  const fsId = friendshipId(myUid, currentFriend.uid);
  sendMessage(db, fsId, myUid, myUsername, "", replyingTo, url);
  replyingTo = null;
  renderReplyPreview();
  document.getElementById("picker-popup").style.display = "none";
}

function openChat(friend) {
  currentFriend = friend;
  replyingTo = null;
  const fsId = friendshipId(myUid, friend.uid);

  const mainArea = document.getElementById("main-area");
  mainArea.innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <div class="avatar-circle small-avatar" style="background-color:${getAvatarColor(friend.username)}">${getInitial(friend.username)}</div>
        <span class="chat-username">${escapeHtml(friend.username)}</span>
      </div>
      <div class="messages-list" id="messages-list"></div>
      <div id="reply-preview-container"></div>
      <div class="message-input-row" id="message-input-row">
        <button id="plus-btn" class="icon-btn" title="Add image (coming soon)">+</button>
        <div class="input-wrapper">
          <input type="text" id="message-input" placeholder="Message @${escapeHtml(friend.username)}">
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
    </div>
  `;

  if (currentMessagesUnsubscribe) currentMessagesUnsubscribe();
  currentMessagesUnsubscribe = listenForMessages(db, fsId, renderMessages);

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

function sendCurrentMessage() {
  const input = document.getElementById("message-input");
  const text = input.value;
  if (!text.trim() || !currentFriend) return;
  const fsId = friendshipId(myUid, currentFriend.uid);
  sendMessage(db, fsId, myUid, myUsername, text, replyingTo);
  input.value = "";
  replyingTo = null;
  renderReplyPreview();
}

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

document.getElementById("rail-add-btn").addEventListener("click", () => {
  alert("Servers are coming in a future step!");
});
