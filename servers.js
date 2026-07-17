import { collection, doc, setDoc, deleteDoc, getDocs, updateDoc, query, where, onSnapshot, arrayUnion, arrayRemove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

const BANNER_COLORS = ["#0000ff", "#5b3df5", "#2e7dff", "#ef4444", "#f59e0b", "#4ade80", "#ec4899", "#14b8a6"];

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function randomBannerColor() {
  return BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)];
}

export async function createServer(db, ownerUid, ownerUsername, name, isPrivate) {
  const serverRef = doc(collection(db, "servers"));
  const joinCode = randomCode();

  await setDoc(serverRef, {
    name: name.trim(),
    ownerUid,
    isPrivate,
    joinCode,
    bannerColor: randomBannerColor(),
    members: [ownerUid],
    memberUsernames: { [ownerUid]: ownerUsername },
    createdAt: serverTimestamp()
  });

  const defaultChannels = [
    { id: "mod", name: "mod-only", type: "mod", locked: false },
    { id: "announcements", name: "announcements", type: "announcements", locked: false },
    { id: "general", name: "general", type: "general", locked: false }
  ];

  for (const ch of defaultChannels) {
    await setDoc(doc(db, "servers", serverRef.id, "channels", ch.id), {
      name: ch.name,
      type: ch.type,
      locked: ch.locked,
      createdAt: serverTimestamp()
    });
  }

  return { id: serverRef.id, joinCode };
}

export async function createChannel(db, serverId, name, locked = false) {
  const chRef = doc(collection(db, "servers", serverId, "channels"));
  await setDoc(chRef, {
    name: name.trim(),
    type: "general",
    locked,
    createdAt: serverTimestamp()
  });
  return chRef.id;
}

export async function updateServerSettings(db, serverId, updates) {
  await updateDoc(doc(db, "servers", serverId), updates);
}

export async function setCustomJoinCode(db, serverId, code) {
  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length < 4 || cleanCode.length > 10) {
    throw new Error("Custom code needs to be 4-10 characters.");
  }
  const q = query(collection(db, "servers"), where("joinCode", "==", cleanCode));
  const snap = await getDocs(q);
  if (!snap.empty && snap.docs[0].id !== serverId) {
    throw new Error("That code is already taken. Try another.");
  }
  await updateDoc(doc(db, "servers", serverId), { joinCode: cleanCode });
  return cleanCode;
}

export async function deleteServerEntirely(db, serverId) {
  const channelsSnap = await getDocs(collection(db, "servers", serverId, "channels"));
  for (const chDoc of channelsSnap.docs) {
    const messagesSnap = await getDocs(collection(db, "servers", serverId, "channels", chDoc.id, "messages"));
    for (const msgDoc of messagesSnap.docs) {
      await deleteDoc(msgDoc.ref);
    }
    await deleteDoc(chDoc.ref);
  }

  const joinReqSnap = await getDocs(collection(db, "servers", serverId, "joinRequests"));
  for (const reqDoc of joinReqSnap.docs) {
    await deleteDoc(reqDoc.ref);
  }

  await deleteDoc(doc(db, "servers", serverId));
}

export async function leaveServer(db, serverId, uid) {
  await updateDoc(doc(db, "servers", serverId), {
    members: arrayRemove(uid),
    [`mentions.${uid}`]: 0
  });
}

export async function markChannelRead(db, serverId, channelId, uid) {
  await updateDoc(doc(db, "servers", serverId, "channels", channelId), {
    [`lastRead.${uid}`]: serverTimestamp()
  });
}

export async function clearServerMentions(db, serverId, uid) {
  await updateDoc(doc(db, "servers", serverId), {
    [`mentions.${uid}`]: 0
  });
}

export async function joinServerByCode(db, uid, username, code) {
  const q = query(collection(db, "servers"), where("joinCode", "==", code.trim().toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("No server found with that code.");

  const serverDoc = snap.docs[0];
  const serverId = serverDoc.id;
  const data = serverDoc.data();

  if (data.members.includes(uid)) throw new Error("You're already in this server!");

  if (data.isPrivate) {
    await setDoc(doc(db, "servers", serverId, "joinRequests", uid), {
      uid,
      username,
      createdAt: serverTimestamp()
    });
    return { requested: true, serverName: data.name };
  } else {
    await updateDoc(doc(db, "servers", serverId), {
      members: arrayUnion(uid),
      [`memberUsernames.${uid}`]: username
    });
    return { requested: false, serverName: data.name };
  }
}

export function listenForMyServers(db, uid, callback) {
  const q = query(collection(db, "servers"), where("members", "array-contains", uid));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function listenForJoinRequests(db, serverId, callback) {
  return onSnapshot(collection(db, "servers", serverId, "joinRequests"), (snap) =>
    callback(snap.docs.map((d) => d.data()))
  );
}

export async function approveJoinRequest(db, serverId, uid, username) {
  await updateDoc(doc(db, "servers", serverId), {
    members: arrayUnion(uid),
    [`memberUsernames.${uid}`]: username
  });
  await deleteDoc(doc(db, "servers", serverId, "joinRequests", uid));
}

export async function declineJoinRequest(db, serverId, uid) {
  await deleteDoc(doc(db, "servers", serverId, "joinRequests", uid));
}

export function listenForChannels(db, serverId, callback) {
  return onSnapshot(collection(db, "servers", serverId, "channels"), (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function updateChannel(db, serverId, channelId, updates) {
  await updateDoc(doc(db, "servers", serverId, "channels", channelId), updates);
}

export async function deleteChannelDoc(db, serverId, channelId) {
  await deleteDoc(doc(db, "servers", serverId, "channels", channelId));
}
