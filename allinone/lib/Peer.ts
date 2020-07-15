import { EventEmitter } from 'events';
import * as socketio from 'socket.io';
import {Room} from './Room';
import { getLogger } from 'log4js';
const logger = getLogger('Peer');
const DISCONNECT_CHECK_COUNT = 6;
const DISCONNECT_CHECK_DELAY = 3000; //ms

export class Peer extends EventEmitter {
	closed = false;
	joined = false;
	displayName: string;
	picture: string;
	platform: string;
	address: string;
	enterTime = Date.now();
	disconnectCheck = 0;
	intervalHandler;

	constructor(
		public id: string, 
		public socket: socketio.Socket,
		public room: Room) {

		super();

		logger.info('constructor() [id:"%s", socket:"%s"]', id, socket.id);

		this.address = socket.handshake.address;
		this.setMaxListeners(Infinity);
		this.handlePeer();
	}

	close() {
		logger.info('peer %s call close()', this.id);

		this.closed = true;

		if (this.intervalHandler ) {
			clearInterval(this.intervalHandler);
			this.intervalHandler = null;
		}

		if (this.socket){
			this.socket.disconnect(true);
		}

		this.emit('close');
	}

	public handlePeerReconnect(socket: socketio.Socket) {
		this.socket.leave(this.room.id);
		this.socket.disconnect(true);
		logger.info('peer %s reconnnected! disconnect previous connection now.', this.id);

		this.socket = socket;
		this.socket.join(this.room.id);
		this.room.setupSocketHandler(this);
		this.handlePeer();
	}

	private handlePeer() {
		this.socket.on('disconnect', (reason) => {
			if (this.closed) {
				return;
			}

			logger.debug('"socket disconnect" event [id:%s], reason: %s', this.id, reason);
			this.intervalHandler = setInterval(() => {
				this.checkClose();
			}, DISCONNECT_CHECK_DELAY);
		});

		this.socket.on('error', (error) => {
			logger.info('socket error, peer: %s, error: %s', this.id, error);
		});
	}

	public checkClose() {
		if (!this.socket.connected) {
			this.disconnectCheck++;

			if ( this.disconnectCheck > DISCONNECT_CHECK_COUNT ) {
				this.close();
			}
		} else {
			clearInterval(this.intervalHandler);
			this.intervalHandler = null;
			this.disconnectCheck = 0;
		}
	}

	peerInfo() {
		const peerInfo = {
			id          : this.id,
			displayName : this.displayName,
			picture     : this.picture,
			platform	: this.platform,
			address		: this.address,
			durationTime	: (Date.now() -  this.enterTime) / 1000,
		};

		return peerInfo;
	}
}
