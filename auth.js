import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const messageBox = document.getElementById('message');

document.getElementById('signup-btn').addEventListener('click', () => {
  createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
    .then((result) => {
      messageBox.textContent = "Account created! Welcome, " + result.user.email;
      messageBox.style.color = "#4ade80";
    })
    .catch((error) => {
      messageBox.textContent = error.message;
      messageBox.style.color = "#f87171";
    });
});

document.getElementById('login-btn').addEventListener('click', () => {
  signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
    .then((result) => {
      messageBox.textContent = "Welcome back, " + result.user.email;
      messageBox.style.color = "#4ade80";
    })
    .catch((error) => {
      messageBox.textContent = error.message;
      messageBox.style.color = "#f87171";
    });
});
