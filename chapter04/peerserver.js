//#!/usr/bin/env node
// WebSocket chat server
//

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

// Pathnames of the SSL key and certificate files to use for
// HTTPS connections.

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

// Used for managing the text chat user list.
let connectionArray = [];
let nextID = Date.now();
const appendToMakeUnique = 1;

// Output logging information to console
function log(text) {
  const time = new Date();

  console.log("[" + time.toLocaleTimeString() + "] " + text + "\n");
}

// If you want to implement support for blocking specific origins, this is
// where you do it. Just return false to refuse WebSocket connections given
// the specified origin.
function originIsAllowed(origin) {
  return true;    // We will accept all connections
}

// Scans the list of users and see if the specified name is unique. If it is,
// return true. Otherwise, returns false. We want all users to have unique
// names.
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

// Sends a message (which is already stringified JSON) to a single
// user, given their username. We use this for the WebRTC signaling,
// and we could use it for private text messaging.
function sendToOneUser(target, msgString) {
  let i = 0;

  for (; i<connectionArray.length; i++) {
    if (connectionArray[i].username === target) {
      connectionArray[i].sendUTF(msgString);
      break;
    }
  }
}

// Scan the list of connections and return the one for the specified
// clientID. Each login gets an ID that doesn't change during the session,
// so it can be tracked across username changes.
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

// Builds a message object of type "userlist" which contains the names of
// all connected users. Used to ramp up newly logged-in users and,
// inefficiently, to handle name change notifications.
function makeUserListMessage() {
  let userListMsg = {
    type: "userlist",
    users: []
  };

  // Add the users to the list

  let i = 0;
  for (; i<connectionArray.length; i++) {
    userListMsg.users.push(connectionArray[i].username);
  }

  return userListMsg;
}

// Sends a "userlist" message to all chat members. This is a cheesy way
// to ensure that every join/drop is reflected everywhere. It would be more
// efficient to send simple join/drop messages to each user, but this is
// good enough for this simple example.
function sendUserListToAll() {
  let userListMsg = makeUserListMessage();
  let userListMsgStr = JSON.stringify(userListMsg);

  let i = 0;
  for (; i<connectionArray.length; i++) {
    connectionArray[i].sendUTF(userListMsgStr);
  }
}


// Try to load the key and certificate files for SSL so we can
// do HTTPS (required for non-local WebRTC).

var httpsOptions = {
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

// If we were able to get the key and certificate files, try to
// start up an HTTPS server.

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


// Our HTTPS server does nothing but service WebSocket
// connections, so every request just returns 404. Real Web
// requests are handled by the main server on the box. If you
// want to, you can return real HTML here and serve Web content.

function handleWebRequest(request, response) {
  log ("Received request for " + request.url);
  response.writeHead(404);
  response.end();
}

// Spin up the HTTPS server on the port assigned to this sample.
// This will be turned into a WebSocket port very shortly.

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

// Set up a "connect" message handler on our WebSocket server. This is
// called whenever a user connects to the server's port using the
// WebSocket protocol.

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

      // Process incoming data.

      let sendToClients = true;
      msg = JSON.parse(message.utf8Data);
      let connect = getConnectionForID(msg.id);

      switch(msg.type) {
        case "message":
          msg.name = connect.username;
          msg.text = msg.text.replace(/(<([^>]+)>)/ig, "");
          break;

        // Username change
        case "username":
          let nameChanged = false;
          let origName = msg.name;

          // Ensure the name is unique by appending a number to it
          // if it's not; keep trying that until it works.
          while (!isUsernameUnique(msg.name)) {
            msg.name = origName + appendToMakeUnique;
            appendToMakeUnique++;
            nameChanged = true;
          }

          // If the name had to be changed, we send a "rejectusername"
          // message back to the user so they know their name has been
          // altered by the server.
          if (nameChanged) {
            let changeMsg = {
              id: msg.id,
              type: "rejectusername",
              name: msg.name
            };
            connect.sendUTF(JSON.stringify(changeMsg));
          }

          // Set this connection's final username and send out the
          // updated user list to all users. Yeah, we're sending a full
          // list instead of just updating. It's horribly inefficient
          // but this is a demo. Don't do this in a real app.
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
