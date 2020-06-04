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
let transceiver = null; 
let webcamStream = null; 
let myHostname = null;
let logBox = null;
let chroma = null
let isConnected = false;
let selectedCodec = 'VP8';
let usersArray = null;
let inviteUser = null;
const signaling_host = location.host;
const signaling_port = location.port || 443;
const roomID = 'signalingtestroom';
const peerID = makeRandomString(8);
const socketURL =  `wss://${signaling_host}:${signaling_port}/?roomId=${roomID}&peerId=${peerID}`;

let websock = null; //WebSocket
let socket = null; //Socket.IO client

function getCapabilitiesCodec(codec) {
  let capCodes = RTCRtpSender.getCapabilities('video').codecs;
  let cap = null;
  switch(codec) {
    case 'VP8':
    case 'VP9':
      cap = capCodes.find(item => item.mimeType.match(codec));
      break;
    case 'H264':
      cap = capCodes.find(item => item.mimeType.match(codec) && item.sdpFmtpLine.match('42e01f'));
  }

  capCodes = capCodes.filter(item => item !== cap);
  capCodes = [cap, ...capCodes];
  log("Sorted Capabilities =>" + JSON.stringify(capCodes));
  return capCodes;
}

window.onload = () => {
  logBox = document.querySelector(".logbox");
  if (!logBox){
    console.error('get logbox error!');
  }

  myHostname = window.location.hostname;
  if (!myHostname) {
    myHostname = "localhost";
  }
  log("Hostname: " + myHostname);

  console.log('document loaded');
}

function replaceBackground() {
  if (!isConnected) return;

  if (!chroma) {
    chroma = new ChromaKey();
    chroma.doLoad();
  }

  const checkBox = document.getElementById('replace');
  if (checkBox.checked) {
    log("replace background checked!");
    const chromaTrack = chroma.capStream.getVideoTracks()[0];
    pc.getSenders().forEach(sender => {
      if(sender.track.kind !== 'video') return;
      sender.replaceTrack(chromaTrack);
    });
    document.getElementById("chroma_video").srcObject = chroma.capStream;
  } else {
    log("replace background unchecked!");
    const cameraTrack = webcamStream.getVideoTracks()[0];
    pc.getSenders().forEach(sender => {
      if(sender.track.kind !== 'video') return;
      sender.replaceTrack(cameraTrack);
    });
    document.getElementById("chroma_video").srcObject = webcamStream;
  }
}

function updateBitrate() {
  if(!pc || !isConnected) return;
  let bitrate = document.getElementById('bitrate').value;
  log("* Set MaxBitrate to : " + bitrate + "kbps");
  bitrate = bitrate * 1024;

  pc.getSenders().forEach(sender => {
    if(sender.track.kind === 'audio') return;

    let param = sender.getParameters();
    param.encodings[0].maxBitrate = bitrate;
    sender.setParameters(param)
    .then(() => {
      param = sender.getParameters();
      log(" * Video Sender Encodings * ");
      const senderParamsEncoding = param.encodings.map(encoding => JSON.stringify(encoding)).join("\n");
      log(senderParamsEncoding);
    })
    .catch(error => {
      error("Set MaxBitrate error! " + error.name);
    });
  });
}

function selectCodec() {
  selectedCodec = document.getElementById("codecSelect").value;
  log("* Select codec : " + selectedCodec);

  if (isConnected) {
    pc.restartIce();
  }
}

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

function sendRequest(method, data = null) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject('No socket connection.');
    } else {
      socket.emit('request', { method, data },
        timeoutCallback((err, response) => {
          if (err) {
            error('sendRequest %s timeout! socket: %o', method);
            reject(err);
          } else {
            resolve(response);
          }
        })
      );
    }
  });
}

function timeoutCallback(callback) {
  let called = false;

  const interval = setTimeout(() => {
    if (called) {
      return;
    }
    called = true;
    callback(new Error('Request timeout.'));
  }, 5000);

  return (...args) => {
    if (called) {
      return;
    }
    called = true;
    clearTimeout(interval);

    callback(...args);
  };
}

function connect() {
  log(`Connecting to signaling server: ${socketURL}`);
  socket = io.connect(socketURL);

  socket.on('connect', async () => {
    log('SocketIO client connected to signaling server!');
    const allusers = await sendRequest('join', {
      displayName: document.getElementById("name").value
    });

    if(allusers.peers.length) {
      handleUserlistMsg(allusers.peers, true);
    } else if (allusers.joined) {
      log("You have joined!");
    }

  });

  socket.on('disconnect', () => {
    error('*** SocketIO disconnected!');
  });

  socket.on('connect_error', (err) => {
    error('*** SocketIO client connect error!' + err);
  });

  socket.on('connect_timeout', () => {
    error('*** SocketIO client connnect timeout!');
  });

  socket.on('error', () => {
    error('*** SocketIO error occors !' + error.name);
  });
  socket.on('notification', async (notification) => {
    const msg = notification.data;
    log("Receive'" + notification.method + "' message: " + JSON.stringify(msg));
    switch(notification.method) {
      case 'newPeer':
        handleUserlistMsg([msg]);
        break;
      case 'videoAnswer':
        handleVideoAnswerMsg(msg);
        break;
      case 'videoOffer':
        handleVideoOfferMsg(msg);
        break;
      case 'newIceCandidate' :
        handleNewICECandidateMsg(msg);
        break;
    }
  });

  socket.on('username', (msg) => {
    log("Receive'" + msg.type + "' message: " + JSON.stringify(msg));
    text = "<b>User <em>" + msg.name + "</em> signed in at " + timeStr + "</b><br>";
  });

  socket.on('video-answer', (msg) => {
    log("Receive'" + msg.type + "' message: " + JSON.stringify(msg));
  });

  socket.on('video-offer', (msg) => {
    log("Receive'" + msg.type + "' message: " + JSON.stringify(msg));
  });

  socket.on('new-ice-candidate', (msg) => {
    log("Receive'" + msg.type + "' message: " + JSON.stringify(msg));
    handleNewICECandidateMsg(msg);
  });
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
}

function handleConnectionStateChange() {
  warn("*** Connection state changed to: " + pc.connectionState);
  switch (pc.connectionState) {
    case 'connected' :
      const config = pc.getConfiguration();
      log("*** Connection Configuration: " + JSON.stringify(config));
      getSenderParams();
      getReceiverParams();
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

  const codecCap = getCapabilitiesCodec(selectedCodec);
  try {
    pc.getTransceivers().forEach(t => {
      if(t.sender.track.kind !== 'video') return;
      t.setCodecPreferences(codecCap);
    });
  } catch(err) {
    error("setCodecPreferences error! " + err.name);
  }

  try {
    log("---> Setting local description to the offer");
    await pc.setLocalDescription();

    log("---> Sending the offer to the remote peer");

    sendRequest('videoOffer', {
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

    sendRequest('newIceCandidate', {
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
      getSenderParams();
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
  if (pc) {
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

  getRtpCapabilities();

  inviteUser = usersArray.find(user => user.id === id);
  log("Setting up connection to invite user: " + inviteUser.displayName);
  createPeerConnection();

  try {
    webcamStream.getTracks().forEach(
      track => pc.addTrack(track, webcamStream)
    );
  } catch(err) {
    handleGetUserMediaError(err);
  }

  document.getElementById('replace').disabled = false;
  document.getElementById('updateBitrate').disabled = false;
}

async function handleVideoOfferMsg(msg) {
  const fromUser = usersArray.find(user => user.id === msg.from);
  const toUser = usersArray.find(user => user.id === msg.to);

  log("Received video chat offer from " + fromUser.displayName + " to " + toUser.displayName);
  if (!pc) {
    createPeerConnection();
  }

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
  sendRequest('videoAnswer', {
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

function getRtpCapabilities() {
  const videoCapabilities = RTCRtpSender.getCapabilities('video');
  const audioCapabilities = RTCRtpSender.getCapabilities('audio');

  const videoCodecList = videoCapabilities.codecs;
  const videoCodecListString = videoCodecList.map(codec => JSON.stringify(codec)).join("\n");
  const videoRtpExtensionUri = videoCapabilities.headerExtensions.uri;

  log(" *** Video Sender Capabilitie *** ");
  log(videoCodecListString);
  log("RTP headerExtensions: " + videoRtpExtensionUri);

  const audioCodecList = audioCapabilities.codecs;
  const audioCodecListString = audioCodecList.map(codec => JSON.stringify(codec)).join("\n");
  const audioRtpExtensionUri = audioCapabilities.headerExtensions.uri;

  log(" *** Audio Sender Capabilitie *** ");
  log(audioCodecListString);
  log("RTP headerExtensions: " + audioRtpExtensionUri);
}

function getSenderParams() {
  const transceivers = pc.getTransceivers();
  log("Transceivers number: " + transceivers.length);
  transceivers.forEach(transceiver => {
    const sender = transceiver.sender;

    if(sender.track.kind !== 'video') return;

    let senderParams = sender.getParameters();
    const senderTrans = sender.transport;

    log(" *** Transceivers sender track : " + sender.track.id + "(" + sender.track.kind + ") *** ");
    log(`
      Transceiver currentDirection : ${transceiver.currentDirection}
      Transceiver mid: ${transceiver.mid}
      `);

    log("Send transport role: " + senderTrans.iceTransport.role);
    log("Send transport local candidate pair : " + senderTrans.iceTransport.getSelectedCandidatePair().local.candidate);
    log("Send transport remote candidate pair: " + senderTrans.iceTransport.getSelectedCandidatePair().remote.candidate);
    log("Sender transactionId: " + senderParams.transactionId);
    log(" * Video Sender Codecs * ");
    const senderParamsCodec = senderParams.codecs.map(codec => JSON.stringify(codec)).join("\n");
    log(senderParamsCodec);
    log(" * Video Sender Encodings * ");
    const senderParamsEncoding = senderParams.encodings.map(encoding => JSON.stringify(encoding)).join("\n");
    log(senderParamsEncoding);
  });
}

function getReceiverParams() {
  const transceivers = pc.getTransceivers();
  log("Transceivers number: " + transceivers.length);
  transceivers.forEach(transceiver => {
    const receiver = transceiver.receiver;

    if(receiver.track.kind !== 'video') return;

    const receiverParams = receiver.getParameters();
    const receiverTrans = receiver.transport;

    log(" *** Transceivers receiver track : " + receiver.track.id + "(" + receiver.track.kind + ") *** ");
    log(`
      Transceiver currentDirection : ${transceiver.currentDirection}
      Transceiver mid: ${transceiver.mid}
      `);

    log("Receiver transport role: " + receiverTrans.iceTransport.role);
    log("Receiver transport local candidate pair : " + receiverTrans.iceTransport.getSelectedCandidatePair().local.candidate);
    log("Receiver transport remote candidate pair: " + receiverTrans.iceTransport.getSelectedCandidatePair().remote.candidate);
    log(" * Video Receiver Codecs * ");
    const receiverParamsCodec = receiverParams.codecs.map(codec => JSON.stringify(codec)).join("\n");
    log(receiverParamsCodec);
    log(" * Video Receiver Encodings * ");
    const ReceiverParamsEncoding = receiverParams.encodings.map(encoding => JSON.stringify(encoding)).join("\n");
    log(ReceiverParamsEncoding);
  });

}

function makeRandomString(length) {
  let outString = '';
  const inOptions = 'abcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    outString += inOptions.charAt(Math.floor(Math.random() * inOptions.length));
  }

  return outString;
};
