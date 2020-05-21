//
// Dove into Webrtc example for RTCPeerConnection
//

"use strict";

const mediaConstraints = {
  audio: true,
  video: true
};
let connection = null;
let clientID = 0;
let myUsername = null;
let targetUsername = null;
let pc = null; // local RTCPeerConnection
let transceiver = null; 
let webcamStream = null; 
let myHostname = null;
let logBox = null;

window.onload = () => {
  logBox = document.querySelector(".chatbox");
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
  connection.send(msgJSON);
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
  connection = new WebSocket(serverUrl, "json");

  connection.onerror = (evt) => {
    console.dir(evt);
  }

  connection.onmessage = (evt) => {
    let text = "";
    const msg = JSON.parse(evt.data);
    log("Message received: " + evt.data);
    const time = new Date(msg.date);
    const timeStr = time.toLocaleTimeString();

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

async function createPeerConnection() {
  log("Setting up a connection...");

  pc = new RTCPeerConnection({
    iceServers: [   
      {
        urls: "turn:" + "webrtc-from-chat.glitch.me",  // A TURN server
        username: "webrtc",
        credential: "turnserver"
      }
    ]
  });

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
      break;
    case 'disconnected' :
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

async function handleIceCandidateError(event) {
  error("ICE Candidate Error, errCode: " + event.errorCode + " errorText: " + event.errorText);
}

async function handleNegotiationNeededEvent() {
  log("*** Negotiation needed");

  try {
    if (pc.signalingState != "stable") {
      log("-- The connection isn't stable yet; postponing...")
      return;
    }

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
    case "closed":
      closeVideoCall();
      break;
  }
}

function handleICEGatheringStateChangeEvent(event) {
  warn("*** ICE gathering state changed to: " + pc.iceGatheringState);
}

function handleUserlistMsg(msg) {
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
    alert("You can't start a call because you already have one open!");
  } else {
    const clickedUsername = evt.target.textContent;

    if (clickedUsername === myUsername) {
      alert("I'm afraid I can't let you talk to yourself. That would be weird.");
      return;
    }

    targetUsername = clickedUsername;
    log("Inviting user " + targetUsername);

    log("Setting up connection to invite user: " + targetUsername);
    createPeerConnection();

    try {
      webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      document.getElementById("local_video").srcObject = webcamStream;
    } catch(err) {
      handleGetUserMediaError(err);
      return;
    }

    try {
      webcamStream.getTracks().forEach(
        transceiver = track => pc.addTransceiver(track, {streams: [webcamStream]})
      );
    } catch(err) {
      handleGetUserMediaError(err);
    }
  }
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

    // Add the camera stream to the RTCPeerConnection

    try {
      webcamStream.getTracks().forEach(
        transceiver = track => pc.addTransceiver(track, {streams: [webcamStream]})
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
  log("*** Call recipient has accepted our call");
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
