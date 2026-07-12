import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { getAvatarColor, getInitial } from './avatar.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const username = userDoc.exists() ? userDoc.data().username : user.email;

  document.getElementById("my-username").textContent = username;
  const avatarEl = document.getElementById("my-avatar");
  avatarEl.textContent = getInitial(username);
  avatarEl.style.backgroundColor = getAvatarColor(username);
});

document.getElementById("logout-btn").addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "login.html");
});

document.getElementById("rail-add-btn").addEventListener("click", () => {
  alert("Servers are coming in a future step!");
});
