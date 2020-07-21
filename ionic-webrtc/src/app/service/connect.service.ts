import { Injectable } from '@angular/core';
import * as io from 'socket.io-client';
import { Device } from '@ionic-native/device/ngx';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ConnectService {

  socket = null;
  pc: RTCPeerConnection;
  isConnected = false;
  peerId = '';
  fromUser;
  stream: MediaStream;
  webcamStream: MediaStream;
  channel: RTCDataChannel;
  remotePeers;
  connected$ = new Subject();

  chatMessages = [];
  inputMsg;

  constructor(
    private device: Device,
  ) {
  }

  connect(uri: string, peerId: string) {
    this.peerId = peerId;

    this.socket = io.connect(uri);
    this.socket.on('connect', async () => {
      this.onConnected();
    });

    this.socket.on('disconnect', () => {
      console.error('*** SocketIO disconnected!');
    });

    this.socket.on('notification', async (notification) => {
      const msg = notification.data;
      this.fromUser = this.remotePeers.find((user) => user.id === msg.from);
      const toUser = this.remotePeers.find((user) => user.id === msg.to);

      switch (notification.method) {
        case 'newPeer':
          this.remotePeers.push(msg);
          break;
        case 'sdpAnswer':
          await this.pc.setRemoteDescription(msg.sdp).catch((err) => {
            console.error(err.name + ':' + err.message);
          });
          break;
        case 'sdpOffer':
          if (this.pc.signalingState !== 'stable') {
            await Promise.all([
              this.pc.setLocalDescription({ type: 'rollback' }),
              this.pc.setRemoteDescription(msg.sdp),
            ]);
            return;
          } else {
            await this.pc.setRemoteDescription(msg.sdp);
          }

          if (!this.webcamStream) {
            try {
              this.webcamStream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: true
                }
              );
            } catch (err) {
              console.error(`${err.name}: ${err.message}`);
              return;
            }

            try {
              this.webcamStream.getTracks().forEach((track) => this.pc.addTrack(track, this.webcamStream));
            } catch (err) {
              console.error(`${err.name}: ${err.message}`);
              return;
            }
          }

          await this.pc.createAnswer().then(offer => {
            return this.pc.setLocalDescription(offer);
          });

          this.sendRequest('sdpAnswer', {
            from: this.peerId,
            to: this.fromUser.id,
            sdp: this.pc.localDescription,
          });
          break;
        case 'newIceCandidate':
          try {
            await this.pc.addIceCandidate(msg.candidate);
          } catch (err) {
            console.error(`${err.name}: ${err.message}`);
          }
          break;
      }
    });
  }

  sendRequest(method, data = null) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject('No socket connection.');
      } else {
        this.socket.emit('request', { method, data },
          this.timeoutCallback((err, response) => {
            if (err) {
              console.error('sendRequest %s timeout! socket: %o', method);
              reject(err);
            } else {
              resolve(response);
            }
          })
        );
      }
    });
  }

  timeoutCallback(callback) {
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

  async onConnected() {
    const allusers = await this.sendRequest('join', {
      displayName: this.peerId + '-' + 'ionic'
    }) as any;

    if (allusers.peers && allusers.peers.length) {
      this.remotePeers = allusers.peers;
      this.createPeerConnection();
    } else if (allusers.joined) {
      alert('You have joined!');
    }

    this.connected$.next();
  }

  createPeerConnection() {
    this.pc = new RTCPeerConnection();
    this.pc.onconnectionstatechange = () => {
      switch (this.pc.connectionState) {
        case 'connected':
          this.isConnected = true;
          break;
        case 'disconnected':
          this.isConnected = false;
          break;
        case 'failed':
          (this.pc as any).restartIce();
          setTimeout(() => {
            if (this.pc.iceConnectionState !== 'connected') {
              console.error(
                'restartIce failed! close video call!' +
                  'Connection state:' +
                  this.pc.connectionState
              );
            }
          }, 10000);
          break;
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendRequest('newIceCandidate', {
          from: this.peerId,
          to: this.fromUser.id,
          candidate: event.candidate
        });
      }
    };

    this.pc.onnegotiationneeded = async () => {
      if (this.pc.signalingState !== 'stable') {
        return;
      }

      try {
        await this.pc.createOffer().then(offer => {
          return this.pc.setLocalDescription(offer);
        });

        this.sendRequest('sdpOffer', {
          from: this.peerId,
          to: this.fromUser.id,
          sdp: this.pc.localDescription,
        });
      } catch (err) {
        console.error(`*** The following error occurred while handling the negotiationneeded event, ${err.name} : ${err.message}`);
      }
    };

    this.pc.ontrack = (event: RTCTrackEvent) => {
      this.stream = event.streams[0];
    };

    this.pc.ondatachannel = (event: RTCDataChannelEvent) => {
      this.channel = event.channel;
      this.channel.binaryType = 'arraybuffer';

      this.setupDataChannelEvent(this.channel);
      console.log(`handle data channel event,${this.channel.id}, ${this.channel.binaryType}`);
    };
  }

  setupDataChannelEvent(channel) {
    channel.onopen = () => {
      console.log(`Data Channel opened !!! - '${channel.protocol}'`);
    };

    channel.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const from = this.remotePeers.find(user => user.id === msg.id);

      const time = new Date();
      const timeString = `${time.getHours()}:${time.getMinutes()}`;
      this.chatMessages.push({
        ...msg,
        timeString,
        type: 'rece',
        displayName: from.displayName
      });
    };
  }

  sendMsg() {
    const data = {
      text: this.inputMsg,
      method: 'message',
      id: this.peerId
    };

    this.channel.send(JSON.stringify(data));

    const time = new Date();
    const timeString = `${time.getHours()}:${time.getMinutes()}`;
    this.chatMessages.push({
      ...data,
      timeString,
      type: 'send'
    });

    this.inputMsg = '';
  }
}
