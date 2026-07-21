import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

export function listenForShopItems(db, callback) {
  return onSnapshot(collection(db, "shopItems"), (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function createShopItem(db, name, description, price, imageUrl, scale = 100) {
  const ref = doc(collection(db, "shopItems"));
  await setDoc(ref, {
    name: name.trim(),
    description: description.trim(),
    price,
    imageUrl,
    effectScale: scale,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateShopItem(db, itemId, updates) {
  await updateDoc(doc(db, "shopItems", itemId), updates);
}

export async function deleteShopItem(db, itemId) {
  await deleteDoc(doc(db, "shopItems", itemId));
}

export async function toggleWishlist(db, myUid, itemId, add) {
  await updateDoc(doc(db, "users", myUid), {
    wishlist: add ? arrayUnion(itemId) : arrayRemove(itemId)
  });
}

export async function buyShopItem(db, myUid, itemId, price, currentCredits) {
  if (currentCredits < price) throw new Error("Not enough Credits.");
  await updateDoc(doc(db, "users", myUid), {
    credits: currentCredits - price,
    ownedCosmetics: arrayUnion(itemId),
    wishlist: arrayRemove(itemId)
  });
}

export async function equipCosmetic(db, myUid, itemId) {
  await updateDoc(doc(db, "users", myUid), { equippedEffect: itemId || null });
}
