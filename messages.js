import { getFirestore, collection, addDoc, doc, getDoc, updateDoc, arrayUnion, arrayRemove, query, orderBy, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

export function listenForMessages(db, friendshipId, callback) {
  const q = query(
    collection(db, "friendships", friendshipId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function sendMessage(db, friendshipId, senderId, senderUsername, text, replyTo = null) {
  if (!text.trim()) return;
  const messageData = {
    text: text.trim(),
    senderId: senderId,
    senderUsername: senderUsername,
    createdAt: serverTimestamp(),
    reactions: {}
  };
  if (replyTo) {
    messageData.replyTo = {
      messageId: replyTo.messageId,
      senderUsername: replyTo.senderUsername,
      text: replyTo.text
    };
  }
  await addDoc(collection(db, "friendships", friendshipId, "messages"), messageData);
}

export async function toggleReaction(db, friendshipId, messageId, emoji, uid) {
  const msgRef = doc(db, "friendships", friendshipId, "messages", messageId);
  const snap = await getDoc(msgRef);
  const reactions = (snap.data() && snap.data().reactions) || {};
  const current = reactions[emoji] || [];

  if (current.includes(uid)) {
    await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayRemove(uid) });
  } else {
    await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayUnion(uid) });
  }
}
