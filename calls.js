import {
  doc, collection, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, where, serverTimestamp, limit
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

// ---------- Firestore signaling ----------

export async function createCallDoc(db, friendshipIdVal, callerUid, callerUsername, calleeUid, calleeUsername) {
  const ref = await addDoc(collection(db, 'calls'), {
    friendshipId: friendshipIdVal,
    callerUid, callerUsername,
    calleeUid, calleeUsername,
    status: 'ringing',
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export function listenForIncomingCalls(db, myUid, callback) {
  const q = query(collection(db, 'calls'), where('calleeUid', '==', myUid), where('status', '==', 'ringing'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function listenForCall(db, callId, callback) {
  return onSnapshot(doc(db, 'calls', callId), (snap) => {
    if (!snap.exists()) { callback(null); return; }
    callback({ id: snap.id, ...snap.data() });
  });
}

export async function getActiveCallForFriendship(db, friendshipIdVal) {
  const q = query(collection(db, 'calls'), where('friendshipId', '==', friendshipIdVal), where('status', 'in', ['ringing', 'accepted']), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function setCallOffer(db, callId, offer) {
  await updateDoc(doc(db, 'calls', callId), { offer: { type: offer.type, sdp: offer.sdp } });
}

export async function setCallAnswer(db, callId, answer) {
  await updateDoc(doc(db, 'calls', callId), { answer: { type: answer.type, sdp: answer.sdp }, status: 'accepted', acceptedAt: serverTimestamp() });
}

export async function declineCallDoc(db, callId) {
  await updateDoc(doc(db, 'calls', callId), { status: 'declined' });
  setTimeout(() => deleteCallDoc(db, callId), 4000);
}

export async function endCallDoc(db, callId) {
  try {
    await updateDoc(doc(db, 'calls', callId), { status: 'ended', endedAt: serverTimestamp() });
  } catch (err) { /* already gone */ }
  setTimeout(() => deleteCallDoc(db, callId), 4000);
}

export async function deleteCallDoc(db, callId) {
  try {
    const [callerCands, calleeCands] = await Promise.all([
      getDocs(collection(db, 'calls', callId, 'callerCandidates')),
      getDocs(collection(db, 'calls', callId, 'calleeCandidates'))
    ]);
    await Promise.all([...callerCands.docs, ...calleeCands.docs].map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, 'calls', callId));
  } catch (err) {
    // permission may already be gone once call ended for the other party — safe to ignore
  }
}

function candidatesCollection(db, callId, role) {
  return collection(db, 'calls', callId, role === 'caller' ? 'callerCandidates' : 'calleeCandidates');
}

// ---------- WebRTC session ----------

export class CallSession {
  constructor(db, { callId, role, onRemoteStream, onActiveSpeaker, onConnectionStateChange }) {
    this.db = db;
    this.callId = callId;
    this.role = role; // 'caller' | 'callee'
    this.onRemoteStream = onRemoteStream;
    this.onActiveSpeaker = onActiveSpeaker;
    this.onConnectionStateChange = onConnectionStateChange;

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.localStream = null;
    this.cameraTrack = null;
    this.videoSender = null;
    this.screenTrack = null;
    this.screenSender = null;
    this.remoteStream = new MediaStream();
    this.unsubRemoteCandidates = null;
    this.audioCtx = null;
    this.localSpeakLoop = null;
    this.remoteSpeakLoop = null;

    this.pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((t) => this.remoteStream.addTrack(t));
      this.onRemoteStream?.(this.remoteStream);
    };
    this.pc.onconnectionstatechange = () => this.onConnectionStateChange?.(this.pc.connectionState);
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(candidatesCollection(this.db, this.callId, this.role), event.candidate.toJSON()).catch(() => {});
      }
    };
  }

  async initLocalAudio() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
    this._watchSpeaker(this.localStream, true);
    return this.localStream;
  }

  async createOfferAndSend() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await setCallOffer(this.db, this.callId, offer);
    this._listenRemoteCandidates('callee');
  }

  async acceptWithAnswer(offer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await setCallAnswer(this.db, this.callId, answer);
    this._listenRemoteCandidates('caller');
  }

  async applyRemoteAnswer(answer) {
    if (this.pc.currentRemoteDescription) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  _listenRemoteCandidates(remoteRole) {
    this.unsubRemoteCandidates = onSnapshot(candidatesCollection(this.db, this.callId, remoteRole), (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          this.pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
        }
      });
    });
  }

  toggleMute(muted) {
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }

  async enableCamera() {
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    this.cameraTrack = camStream.getVideoTracks()[0];
    this.videoSender = this.pc.addTrack(this.cameraTrack, this.localStream);
    return this.cameraTrack;
  }

  disableCamera() {
    if (this.cameraTrack) {
      this.cameraTrack.stop();
      if (this.videoSender) { try { this.pc.removeTrack(this.videoSender); } catch (e) {} }
      this.cameraTrack = null;
      this.videoSender = null;
    }
  }

  async startScreenShare(onEndedByBrowser) {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    this.screenTrack = screenStream.getVideoTracks()[0];
    this.screenSender = this.pc.addTrack(this.screenTrack, screenStream);
    this.screenTrack.onended = () => { this.stopScreenShare(); onEndedByBrowser?.(); };
    return this.screenTrack;
  }

  stopScreenShare() {
    if (this.screenTrack) {
      this.screenTrack.stop();
      if (this.screenSender) { try { this.pc.removeTrack(this.screenSender); } catch (e) {} }
      this.screenTrack = null;
      this.screenSender = null;
    }
  }

  _watchSpeaker(stream, isLocal) {
    if (!stream.getAudioTracks().length) return;
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioCtx.createMediaStreamSource(stream);
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      this.onActiveSpeaker?.(isLocal, avg > 12);
      const id = requestAnimationFrame(loop);
      if (isLocal) this.localSpeakLoop = id; else this.remoteSpeakLoop = id;
    };
    loop();
  }

  watchRemoteSpeaker() {
    this._watchSpeaker(this.remoteStream, false);
  }

  cleanup() {
    if (this.localSpeakLoop) cancelAnimationFrame(this.localSpeakLoop);
    if (this.remoteSpeakLoop) cancelAnimationFrame(this.remoteSpeakLoop);
    if (this.audioCtx) this.audioCtx.close().catch(() => {});
    if (this.unsubRemoteCandidates) this.unsubRemoteCandidates();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.cameraTrack?.stop();
    this.screenTrack?.stop();
    this.pc.getSenders().forEach((s) => { try { this.pc.removeTrack(s); } catch (e) {} });
    this.pc.close();
  }
}
