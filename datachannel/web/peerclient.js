//
// Dove into Webrtc example for RTCPeerConnection
//

"use strict";

const mediaConstraints = {
  audio: true,
  video: true
};
let myUsername = null;
let targetUserId = null;
let pc = null; // local RTCPeerConnection
let webcamStream = null; 
let chroma = null
let isConnected = false;
let usersArray = null;
let inviteUser = null;

const signaling_host = location.host;
const signaling_port = location.port || 443;
const roomID = 'signalingtestroom';
const peerID = makeRandomString(8);
const socketURL =  `/?roomId=${roomID}&peerId=${peerID}`;

let dcFile = null; // Data Channel for file trans
let channelId = 0;
let caller = false;

const fileInput = document.querySelector('input#fileInput');
const downloadAnchor = document.querySelector('a#download');
const sendProgress = document.querySelector('progress#sendProgress');
const receiveProgress = document.querySelector('progress#receiveProgress');
const statusMessage = document.querySelector('span#status');
const sendFileButton = document.querySelector('button#sendFile');
const logBox = document.querySelector(".logbox");
const bitrateSpan = document.querySelector('span#bitrate');

const signaling = new SignalingClient();
createPeerConnection();

class peerFile {
  constructor(){}
  reset() {
    this.name = '';
    this.size = 0;
    this.buffer = [];
    this.receivedSize = 0;
    this.time = (new Date()).getTime();
  }
}

const receiveFile = new peerFile();

function log(text) {
  const time = new Date();
  const pText = `<p>[${time.toLocaleTimeString()}] ${text}</p>`;

  logBox.innerHTML += pText;
  logBox.scrollTop = logBox.scrollHeight - logBox.clientHeight;

  console.log(text);
}

function warn(text) {
  const time = new Date();
  const pText = `<p class="warn">[${time.toLocaleTimeString()}] ${text}</p>`;

  logBox.innerHTML += pText;
  logBox.scrollTop = logBox.scrollHeight - logBox.clientHeight;

  console.log(text);
}

function error(text) {
  const time = new Date();
  const pText = `<p class="error">[${time.toLocaleTimeString()}] ${text}</p>`;

  logBox.innerHTML += pText;
  logBox.scrollTop = logBox.scrollHeight - logBox.clientHeight;

  console.log(text);
}

function sendFile() {
  const file = fileInput.files[0];
  log("select file, name: " + file.name + " size: " + file.size);
  dcFile.send(JSON.stringify({
    method: 'file',
    name: file.name,
    size: file.size
  }));

  sendProgress.max = file.size;
  const chunkSize = pc.sctp.maxMessageSize;
  const fileReader = new FileReader();
  let offset = 0;
  fileReader.addEventListener('error', error => console.error('Error reading file:', error));
  fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
  fileReader.addEventListener('load', async e => {
    if (dcFile.bufferedAmount > 65535) {
      await new Promise(resolve => {
        dcFile.onbufferedamountlow = (ev) => {
          log("bufferedamountlow event! bufferedAmount: " + dcFile.bufferedAmount);
          resolve(0);
        }
      }, reject => {
        setTimeout(() => {
          reject('Timeout')
        }, 10000);
      });
    }

    dcFile.send(e.target.result);
    offset += e.target.result.byteLength;
    sendProgress.value = offset;
    if (offset < file.size) {
      readSlice(offset);
    }
  });

  let time = (new Date()).getTime();
  const readSlice = o => {
    console.log('readSlice ', o);
    const slice = file.slice(offset, o + chunkSize);
    fileReader.readAsArrayBuffer(slice);

    const interval = (new Date()).getTime() - time;
    bitrateSpan.textContent = `${Math.round(chunkSize * 8 /interval)}kbps`;
    time = (new Date()).getTime();
  };
  readSlice(0);
}

function newDataChannel() {
  log("*** Create Data Channel.");

  dcFile = pc.createDataChannel(peerID, {protocol: 'file', id: channelId++});
  dcFile.binaryType = 'arraybuffer';
  dcFile.bufferedAmountLowThreshold = 65536;
  log("new data channel , id: " + dcFile.id + ",binaryType: " + dcFile.binaryType + ", protocol: " + dcFile.protocol);
  setupDataChannelEvent(dcFile);
}

function connect() {
  log(`Connecting to signaling server: ${socketURL}`);
  signaling.connect(socketURL);
  signaling.onConnected = async () => {
    log('SocketIO client connected to signaling server!');
    const allusers = await signaling.sendRequest('join', {
      displayName: document.getElementById("name").value
    });

    if(allusers.peers && allusers.peers.length) {
      handleUserlistMsg(allusers.peers, true);
    } else if (allusers.joined) {
      log("You have joined!");
    }
  };

  signaling.onNewPeer = (msg) => {
    handleUserlistMsg([msg]);
  };

  signaling.onSdpOffer = (msg) => {
    handleVideoOfferMsg(msg);
  };

  signaling.onSdpAnswer = (msg) => {
    handleVideoAnswerMsg(msg);
  }

  signaling.onNewIceCandidate = (msg) => {
    handleNewICECandidateMsg(msg);
  };
}

function setupDataChannelEvent(channel) {
  channel.onopen = () => {
    log("*** Data Channel opened !!! - " + channel.protocol);
  }
  channel.onerror = (ev) => {
    const err = ev.error;
    error("**** Data Channel error! errorDetail: " + err.errorDetail + ",error message: " + err.message + " - " +channel.protocol);
  }

  channel.onmessage = (msg) => {
    const data = msg.data;

    log(`Receive data channel message ,type: ${typeof(data)}`);
    log(`Receive data channel message from '${channel.protocol}', size: ${data.byteLength}, data: ${JSON.stringify(data)}`);

    if (typeof(data) === 'string') {
      const mess = JSON.parse(data);
      if(mess.method === 'file') {
        receiveFile.reset();
        receiveFile.name = mess.name;
        receiveFile.size = mess.size;
        log("Receive data channel string message, size: " + mess.size);
        receiveProgress.max = mess.size;
      }

      return;
    }

    receiveFile.buffer.push(data);
    receiveFile.receivedSize += data.byteLength;
    receiveProgress.value = receiveFile.receivedSize;

    const interval = (new Date()).getTime() - receiveFile.time;
    bitrateSpan.textContent = ` ${Math.round(data.byteLength * 8 / interval)}kbps`;
    receiveFile.time = (new Date()).getTime();

    if(receiveFile.receivedSize === receiveFile.size) {
      downloadFile(receiveFile);
    }
  }
}

function downloadFile(file) {
  const received = new Blob(file.buffer);

  downloadAnchor.href = URL.createObjectURL(received);
  downloadAnchor.download = file.name;
  downloadAnchor.textContent =
    `Click to download '${file.name}' (${file.size} bytes)`;
  downloadAnchor.style.display = 'block';
}

function createPeerConnection() {
  log("Setting up a connection...");

  pc = new RTCPeerConnection();
  // Set up event handlers for the ICE negotiation process.
  pc.onconnectionstatechange = handleConnectionStateChange;
  pc.onicecandidateerror = handleIceCandidateError;
  pc.onicecandidate = handleICECandidateEvent;
  pc.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
  pc.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
  pc.onsignalingstatechange = handleSignalingStateChangeEvent;
  pc.onnegotiationneeded = handleNegotiationNeededEvent;
  pc.ontrack = handleTrackEvent;
  pc.ondatachannel = handleDataChannel;
}

function handleDataChannel(event) {
  const channel = event.channel;
  setupDataChannelEvent(channel);
  log("handle data channel event, id: " + channel.id + ",binaryType: " + channel.binaryType + ", protocol: " + channel.protocol);

  dcFile = channel;
  dcFile.binaryType = 'arraybuffer'
}

function handleConnectionStateChange() {
  warn("*** Connection state changed to: " + pc.connectionState);
  switch (pc.connectionState) {
    case 'connected' :
      isConnected = true;
      break;
    case 'disconnected' :
      isConnected = false;
      break;
    case 'failed' :
      warn("Connection failed, now restartIce()...");
      pc.restartIce();
      setTimeout(()=> {
        if(pc.iceConnectionState !== 'connected') {
          error("restartIce failed! close video call!" + "Connection state:" + pc.connectionState);
          closeVideoCall();
        }
      }, 10000);
      break;
  }
}

function handleIceCandidateError(event) {
  error("ICE Candidate Error, errCode: " + event.errorCode + " errorText: " + event.errorText);
}

async function handleNegotiationNeededEvent() {
  log("*** Negotiation needed");
  if (pc.signalingState != "stable") {
    log("-- The connection isn't stable yet; postponing...")
    return;
  }


  try {
    log("---> Setting local description to the offer");
    await pc.setLocalDescription();

    log("---> Sending the offer to the remote peer");
    signaling.sendRequest('sdpOffer', {
      from: peerID,
      to: inviteUser.id,
      sdp: pc.localDescription
    });
  } catch(err) {
    log("*** The following error occurred while handling the negotiationneeded event:");
    reportError(err);
  };
}

function handleTrackEvent(event) {
  warn("*** Track event");
  document.getElementById("received_video").srcObject = event.streams[0];
}

function handleICECandidateEvent(event) {
  if (event.candidate) {
    log("*** Outgoing ICE candidate: " + event.candidate.candidate);

    signaling.sendRequest('newIceCandidate', {
      from: peerID,
      to: inviteUser.id,
      candidate: event.candidate
    });
  }
}

function handleICEConnectionStateChangeEvent(event) {
  warn("*** ICE connection state changed to " + pc.iceConnectionState);
}

function handleSignalingStateChangeEvent(event) {
  warn("*** WebRTC signaling state changed to: " + pc.signalingState);
  switch(pc.signalingState) {
    case "stable":
      break;
    case "closed":
      closeVideoCall();
      break;
  }
}

function handleICEGatheringStateChangeEvent(event) {
  warn("*** ICE gathering state changed to: " + pc.iceGatheringState);
}

function handleUserlistMsg(users, init=false) {
  log("Receive user list from server: " + JSON.stringify(users));
  const listElem = document.querySelector(".userlistbox");

  if (init) {
    usersArray = users;
    while (listElem.firstChild) {
      listElem.removeChild(listElem.firstChild);
    }
  } else {
    usersArray.push(...users);
  }

  users.forEach((user) => {
    let item = document.createElement("li");
    item.appendChild(document.createTextNode(user.displayName));
    item.addEventListener("click", () => invite(user.id), false);

    listElem.appendChild(item);
  });
}

function closeVideoCall() {
  const localVideo = document.getElementById("local_video");

  warn("Closing the call");

  if (pc) {
    warn("--> Closing the peer connection");

    pc.ontrack = null;
    pc.onnicecandidate = null;
    pc.oniceconnectionstatechange = null;
    pc.onsignalingstatechange = null;
    pc.onicegatheringstatechange = null;
    pc.onnotificationneeded = null;

    // Stop all transceivers on the connection
    pc.getTransceivers().forEach(transceiver => {
      transceiver.stop();
    });

    if (localVideo.srcObject) {
      localVideo.pause();
      localVideo.srcObject.getTracks().forEach(track => {
        track.stop();
      });
    }

    // Close the peer connection
    pc.close();
    pc = null;
    webcamStream = null;
  }

  targetUsername = null;
}

async function invite(id) {
  log("Starting to prepare an invitation");
  if (pc && (pc.connectionState === "connected")) {
    alert("不能发起呼叫，因为已经存在一个了！");
    return;
  } 

  if (id === peerID) {
    alert("不能呼叫自己!");
    return;
  }

  log("Getting local camera...");
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    document.getElementById("local_video").srcObject = webcamStream;
  } catch(err) {
    handleGetUserMediaError(err);
    return;
  }

  caller = true;
  inviteUser = usersArray.find(user => user.id === id);
  log("Setting up connection to invite user: " + inviteUser.displayName);

  try {
    webcamStream.getTracks().forEach(
      track => pc.addTrack(track, webcamStream)
    );
  } catch(err) {
    handleGetUserMediaError(err);
  }

  newDataChannel();
}

async function handleVideoOfferMsg(msg) {
  const fromUser = usersArray.find(user => user.id === msg.from);
  const toUser = usersArray.find(user => user.id === msg.to);
  inviteUser = fromUser;

  log("Received video chat offer from " + fromUser.displayName + " to " + toUser.displayName);

  if (pc.signalingState != "stable") {
    log("  - But the signaling state isn't stable, so triggering rollback");

    // Set the local and remove descriptions for rollback; don't proceed
    // until both return.
    await Promise.all([
      pc.setLocalDescription({type: "rollback"}),
      pc.setRemoteDescription(msg.sdp)
    ]);
    return;
  } else {
    log ("  - Setting remote description");
    await pc.setRemoteDescription(msg.sdp);
  }

  if (!webcamStream) {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    } catch(err) {
      handleGetUserMediaError(err);
      return;
    }

    document.getElementById("local_video").srcObject = webcamStream;

    try {
      webcamStream.getTracks().forEach(
        track => pc.addTrack(track, webcamStream)
      );
    } catch(err) {
      handleGetUserMediaError(err);
    }
  }

  log("---> Creating and sending answer to caller");

  await pc.setLocalDescription();
  signaling.sendRequest('sdpAnswer', {
    from: peerID,
    to: fromUser.id,
    sdp: pc.localDescription
  });
}

async function handleVideoAnswerMsg(msg) {
  const fromUser = usersArray.find(user => user.id === msg.from);
  log("*** Receive video chat answer from: " + fromUser.displayName);
  await pc.setRemoteDescription(msg.sdp).catch(reportError);
}

async function handleNewICECandidateMsg(msg) {
  const fromUser = usersArray.find(user => user.id === msg.from);
  log("*** Receive ice candidate from: " + fromUser.displayName);
  log("*** Received ICE candidate: " + JSON.stringify(msg.candidate));
  try {
    await pc.addIceCandidate(msg.candidate)
  } catch(err) {
    reportError(err);
  }
}

function handleGetUserMediaError(e) {
  error(e);
  switch(e.name) {
    case "NotFoundError":
      alert("Unable to open your call because no camera and/or microphone" +
            "were found.");
      break;
    case "SecurityError":
    case "PermissionDeniedError":
      break;
    default:
      alert("Error opening your camera and/or microphone: " + e.message);
      break;
  }

  closeVideoCall();
}

function reportError(errMessage) {
  error(`Error ${errMessage.name}: ${errMessage.message}`);
}

function makeRandomString(length) {
  let outString = '';
  const inOptions = 'abcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    outString += inOptions.charAt(Math.floor(Math.random() * inOptions.length));
  }

  return outString;
};
