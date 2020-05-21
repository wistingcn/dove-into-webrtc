//#!/usr/bin/env node
// Dove into Webrtc example for RTCPeerConnection

"use strict";

const http = require('http');
const https = require('https');
const fs = require('fs');
const WebSocketServer = require('websocket').server;
const yargs = require('yargs');

yargs.usage('Usage: $0 --nocert')
.version('peerserver 0.1')
.option('cert', {describe : 'ssl certificate file'})
.option('key', {describe: 'ssl certificate key file'});

let keyFilePath = null;
let certFilePath = null;
if (yargs.argv.cert) {
  certFilePath = yargs.argv.cert;
  log('use cert file: ' + certFilePath);
}
if (yargs.argv.key) {
  keyFilePath = yargs.argv.key;
  log('use key file: ' + keyFilePath);
}

let connectionArray = [];
let nextID = Date.now();
const appendToMakeUnique = 1;

function log(text) {
  const time = new Date();

  console.log("[" + time.toLocaleTimeString() + "] " + text + "\n");
}

function originIsAllowed(origin) {
  return true;    // We will accept all connections
}

function isUsernameUnique(name) {
  let isUnique = true;
  let i = 0;

  for (; i<connectionArray.length; i++) {
    if (connectionArray[i].username === name) {
      isUnique = false;
      break;
    }
  }
  return isUnique;
}

function sendToOneUser(target, msgString) {
  let i = 0;

  for (; i<connectionArray.length; i++) {
    if (connectionArray[i].username === target) {
      connectionArray[i].sendUTF(msgString);
      break;
    }
  }
}

function getConnectionForID(id) {
  let connect = null;
  let i = 0;

  for (; i<connectionArray.length; i++) {
    if (connectionArray[i].clientID === id) {
      connect = connectionArray[i];
      break;
    }
  }

  return connect;
}

function makeUserListMessage() {
  let userListMsg = {
    type: "userlist",
    users: []
  };

  let i = 0;
  for (; i<connectionArray.length; i++) {
    userListMsg.users.push(connectionArray[i].username);
  }

  return userListMsg;
}

function sendUserListToAll() {
  let userListMsg = makeUserListMessage();
  let userListMsgStr = JSON.stringify(userListMsg);

  let i = 0;
  for (; i<connectionArray.length; i++) {
    connectionArray[i].sendUTF(userListMsgStr);
  }
}

let httpsOptions = {
  key: null,
  cert: null
};

try {
  httpsOptions.key = fs.readFileSync(keyFilePath);
  httpsOptions.cert = fs.readFileSync(certFilePath);
} catch(err) {
  httpsOptions.key = null;
  httpsOptions.cert = null;
}

let webServer = null;
if (httpsOptions.key && httpsOptions.cert) {
  webServer = https.createServer(httpsOptions, handleWebRequest);
}

if (!webServer) {
  try {
    webServer = http.createServer({}, handleWebRequest);
  } catch(err) {
    webServer = null;
    log(`Error attempting to create HTTP(s) server: ${err.toString()}`);
  }
}

function handleWebRequest(request, response) {
  log ("Received request for " + request.url);
  response.writeHead(404);
  response.end();
}

webServer.listen(6503, () => {
  log("Server is listening on port 6503");
});

// Create the WebSocket server by converting the HTTPS server into one.
const wsServer = new WebSocketServer({
  httpServer: webServer,
  autoAcceptConnections: false
});

if (!wsServer) {
  log("ERROR: Unable to create WbeSocket server!");
}

wsServer.on('request', (request) => {
  if (!originIsAllowed(request.origin)) {
    request.reject();
    log("Connection from " + request.origin + " rejected.");
    return;
  }

  // Accept the request and get a connection.
  let connection = request.accept("json", request.origin);
  log("Connection accepted from " + connection.remoteAddress + ".");
  connectionArray.push(connection);

  connection.clientID = nextID;
  nextID++;

  let msg = {
    type: "id",
    id: connection.clientID
  };
  connection.sendUTF(JSON.stringify(msg));

  connection.on('message', (message) => {
    if (message.type === 'utf8') {
      log("Received Message: " + message.utf8Data);

      let sendToClients = true;
      msg = JSON.parse(message.utf8Data);
      let connect = getConnectionForID(msg.id);

      switch(msg.type) {
        case "message":
          msg.name = connect.username;
          msg.text = msg.text.replace(/(<([^>]+)>)/ig, "");
          break;
        case "username":
          let nameChanged = false;
          let origName = msg.name;

          while (!isUsernameUnique(msg.name)) {
            msg.name = origName + appendToMakeUnique;
            appendToMakeUnique++;
            nameChanged = true;
          }

          if (nameChanged) {
            let changeMsg = {
              id: msg.id,
              type: "rejectusername",
              name: msg.name
            };
            connect.sendUTF(JSON.stringify(changeMsg));
          }

          connect.username = msg.name;
          sendUserListToAll();
          sendToClients = false;  // We already sent the proper responses
          break;
      }

      if (sendToClients) {
        let msgString = JSON.stringify(msg);
        let i;

        if (msg.target && msg.target !== undefined && msg.target.length !== 0) {
          sendToOneUser(msg.target, msgString);
        } else {
          for (i=0; i<connectionArray.length; i++) {
            connectionArray[i].sendUTF(msgString);
          }
        }
      }
    }
  });

  connection.on('close', (reason, description) => {
    connectionArray = connectionArray.filter((el, idx, ar) => {
      return el.connected;
    });

    sendUserListToAll();

    let logMessage = "Connection closed: " + connection.remoteAddress + " (" + reason;
    if (description !== null && description.length !== 0) {
      logMessage += ": " + description;
    }
    logMessage += ")";
    log(logMessage);
  });
});
