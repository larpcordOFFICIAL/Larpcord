import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

export function listenForMessages(db, friendshipId, callback) {
  const q = query(
    collection(db, "friendships", friendshipId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function sendMessage(db, friendshipId, senderId, senderUsername, text) {
  if (!text.trim()) return;
  await addDoc(collection(db, "friendships", friendshipId, "messages"), {
    text: text.trim(),
    senderId: senderId,
    senderUsername: senderUsername,
    createdAt: serverTimestamp()
  });
}
