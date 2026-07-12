import { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, query, where, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

export function friendRequestId(fromUid, toUid) {
  return fromUid + "_" + toUid;
}

export function friendshipId(uidA, uidB) {
  return uidA < uidB ? uidA + "_" + uidB : uidB + "_" + uidA;
}

export async function sendFriendRequest(db, myUid, myUsername, targetUsername) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("username", "==", targetUsername));
  const snap = await getDocs(q);

  if (snap.empty) throw new Error("No user found with that username.");

  const targetUid = snap.docs[0].id;
  if (targetUid === myUid) throw new Error("You can't add yourself!");

  await setDoc(doc(db, "friendRequests", friendRequestId(myUid, targetUid)), {
    from: myUid,
    to: targetUid,
    fromUsername: myUsername,
    toUsername: targetUsername,
    createdAt: serverTimestamp()
  });
}

export function listenForIncomingRequests(db, myUid, callback) {
  const q = query(collection(db, "friendRequests"), where("to", "==", myUid));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function acceptFriendRequest(db, request) {
  await setDoc(doc(db, "friendships", friendshipId(request.from, request.to)), {
    members: [request.from, request.to],
    usernames: {
      [request.from]: request.fromUsername,
      [request.to]: request.toUsername
    },
    createdAt: serverTimestamp()
  });
  await deleteDoc(doc(db, "friendRequests", request.id));
}

export async function declineFriendRequest(db, requestId) {
  await deleteDoc(doc(db, "friendRequests", requestId));
}

export function listenForFriends(db, myUid, callback) {
  const q = query(collection(db, "friendships"), where("members", "array-contains", myUid));
  return onSnapshot(q, (snap) => {
    const friends = snap.docs.map((d) => {
      const data = d.data();
      const otherUid = data.members.find((uid) => uid !== myUid);
      return { uid: otherUid, username: data.usernames[otherUid] };
    });
    callback(friends);
  });
}
