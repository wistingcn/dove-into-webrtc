//
// Dove into Webrtc example for RTCPeerConnection
//

"use strict";

const mediaConstraints = {
  audio: true,
  video: true
};
let websock = null; //WebSocket
let clientID = 0;
let myUsername = null;
let targetUsername = null;
let pc = null; // local RTCPeerConnection
let transceiver = null; 
let webcamStream = null; 
let myHostname = null;
let logBox = null;
let chroma = null
let isConnected = false;
let selectedCodec = 'VP8';

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
    sender.setParameters(param).catch(error => {
      error("Set MaxBitrate error! " + error.name);
    });

    param = sender.getParameters();
    log(" * Video Sender Encodings * ");
    const senderParamsEncoding = param.encodings.map(encoding => JSON.stringify(encoding)).join("\n");
    log(senderParamsEncoding);
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

function sendToServer(msg) {
  const msgJSON = JSON.stringify(msg);

  log("Sending '" + msg.type + "' message: " + msgJSON);
  websock.send(msgJSON);
}

function setUsername() {
  myUsername = document.getElementById("name").value;

  sendToServer({
    name: myUsername,
    date: Date.now(),
    id: clientID,
    type: "username"
  });
}

function connect() {
  let scheme = "ws";

  if (document.location.protocol === "https:") {
    scheme += "s";
  }
  const serverUrl = scheme + "://" + myHostname + ":6503";

  log(`Connecting to server: ${serverUrl}`);
  websock = new WebSocket(serverUrl, "json");

  websock.onerror = (evt) => {
    console.dir(evt);
  }

  websock.onmessage = (evt) => {
    let text = "";
    const msg = JSON.parse(evt.data);
    const time = new Date(msg.date);
    const timeStr = time.toLocaleTimeString();

    log("Receive'" + msg.type + "' message: " + evt.data);

    switch(msg.type) {
      case "id":
        clientID = msg.id;
        setUsername();
        break;
      case "username":
        text = "<b>User <em>" + msg.name + "</em> signed in at " + timeStr + "</b><br>";
        break;
      case "message":
        text = "(" + timeStr + ") <b>" + msg.name + "</b>: " + msg.text + "<br>";
        break;
      case "rejectusername":
        myUsername = msg.name;
        text = "<b>Your username has been set to <em>" + myUsername +
          "</em> because the name you chose is in use.</b><br>";
        break;
      case "userlist":
        handleUserlistMsg(msg);
        break;
      case "video-offer":
        handleVideoOfferMsg(msg);
        break;
      case "video-answer":
        handleVideoAnswerMsg(msg);
        break;
      case "new-ice-candidate":
        handleNewICECandidateMsg(msg);
        break;
      case "hang-up":
        handleHangUpMsg(msg);
        break;
      default:
        error("Unknown message received:");
        error(msg);
    }
    if (text.length) {
      log(text);
    }
  };
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
    sendToServer({
      name: myUsername,
      target: targetUsername,
      type: "video-offer",
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

    sendToServer({
      type: "new-ice-candidate",
      target: targetUsername,
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

function handleUserlistMsg(msg) {
  log("Receive user list from server: " + JSON.stringify(msg.users));
  const listElem = document.querySelector(".userlistbox");

  while (listElem.firstChild) {
    listElem.removeChild(listElem.firstChild);
  }

  msg.users.forEach(function(username) {
    let item = document.createElement("li");
    item.appendChild(document.createTextNode(username));
    item.addEventListener("click", invite, false);

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

async function invite(evt) {
  log("Starting to prepare an invitation");
  if (pc) {
    alert("不能发起呼叫，因为已经存在一个了！");
    return;
  } 

  const clickedUsername = evt.target.textContent;
  if (clickedUsername === myUsername) {
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

  targetUsername = clickedUsername;
  log("Setting up connection to invite user: " + targetUsername);
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
  targetUsername = msg.name;

  log("Received video chat offer from " + targetUsername);
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
  sendToServer({
    name: myUsername,
    target: targetUsername,
    type: "video-answer",
    sdp: pc.localDescription
  });
}

async function handleVideoAnswerMsg(msg) {
  const  targetUsername = msg.name;
  log("*** Receive video chat answer from: " + targetUsername);
  await pc.setRemoteDescription(msg.sdp).catch(reportError);
}

async function handleNewICECandidateMsg(msg) {
  log("*** Adding received ICE candidate: " + JSON.stringify(msg.candidate));
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
