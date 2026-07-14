import { collection, addDoc, doc, getDoc, updateDoc, arrayUnion, arrayRemove, increment, query, orderBy, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

export function listenForMessages(db, pathSegments, callback) {
  const q = query(collection(db, ...pathSegments, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function sendMessage(db, pathSegments, senderId, senderUsername, text, replyTo = null, gifUrl = null, recipientUid = null, inviteData = null, channelMeta = null) {
  if (!text.trim() && !gifUrl && !inviteData) return;
  const messageData = {
    text: text.trim(),
    senderId,
    senderUsername,
    createdAt: serverTimestamp(),
    reactions: {}
  };
  if (gifUrl) messageData.gifUrl = gifUrl;
  if (inviteData) messageData.invite = inviteData;
  if (replyTo) {
    messageData.replyTo = {
      messageId: replyTo.messageId,
      senderUsername: replyTo.senderUsername,
      text: replyTo.text
    };
  }
  await addDoc(collection(db, ...pathSegments, "messages"), messageData);

  if (recipientUid) {
    await updateDoc(doc(db, ...pathSegments), { [`unread.${recipientUid}`]: increment(1) });
  }

  if (channelMeta) {
    const channelRef = doc(db, "servers", channelMeta.serverId, "channels", channelMeta.channelId);
    await updateDoc(channelRef, { lastMessageAt: serverTimestamp() });

    if (channelMeta.members && text.trim()) {
      const mentioned = channelMeta.members.filter((m) =>
        m.uid !== senderId && m.username && new RegExp(`@${m.username}\\b`, "i").test(text)
      );
      if (mentioned.length > 0) {
        const serverRef = doc(db, "servers", channelMeta.serverId);
        const updates = {};
        mentioned.forEach((m) => { updates[`mentions.${m.uid}`] = increment(1); });
        await updateDoc(serverRef, updates);
      }
    }
  }
}

export async function markAsRead(db, friendshipId, myUid) {
  await updateDoc(doc(db, "friendships", friendshipId), { [`unread.${myUid}`]: 0 });
}

export async function toggleReaction(db, pathSegments, messageId, emoji, uid) {
  const msgRef = doc(db, ...pathSegments, "messages", messageId);
  const snap = await getDoc(msgRef);
  const reactions = (snap.data() && snap.data().reactions) || {};
  const current = reactions[emoji] || [];

  if (current.includes(uid)) {
    await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayRemove(uid) });
  } else {
    await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayUnion(uid) });
  }
}
