import { EventEmitter } from 'events';
import {Peer} from './Peer';
import { getLogger } from 'log4js';
const logger = getLogger('Room');

export class Room extends EventEmitter {
	static async create(roomId:string ) {
		logger.info('create() [roomId:"%s"]', roomId);

		return new Room(roomId);
	}

	public peers = new Map<string,Peer>();
	public closed = false;
	private bornTime = Date.now();
	private activeTime = Date.now();

	constructor( public id: string ){
		super();
		
		logger.info('constructor() [roomId:"%s"]', id);
		this.setMaxListeners(Infinity);
	}

	public close() {
		logger.info('close() room: %s', this.id);
		this.closed = true;

		this.peers.forEach((peer) => {
			if (!peer.closed) {
				peer.close();
			}
		});

		this.peers.clear();

		this.emit('close');
	}

	public handlePeer(peer: Peer) {
		logger.info('handlePeer() id: %s, address: %s', peer.id, peer.socket.handshake.address);

		peer.socket.join(this.id);
		this.setupSocketHandler(peer);
		this.peers.set(peer.id, peer);

		peer.on('close', () => {
			logger.info('%s closed, room:  %s', peer.id, this.id);
			if (this.closed) {
				return;
			}

			this._notification(peer.socket, 'peerClosed', { peerId: peer.id }, true);

			this.peers.delete(peer.id);

			if (this.checkEmpty()) {
				this.close();
			}
		});
	}

	public setupSocketHandler(peer: Peer) {
		peer.socket.on('request', (request, cb) => {
			this.setActive();

			logger.debug(
				'Peer "request" event [room:"%s", method:"%s", peerId:"%s"]',
				this.id, request.method, peer.id);

			this._handleSocketRequest(peer, request, cb)
				.catch((error) => {
					logger.error('"request" failed [error:"%o"]', error);

					cb(error);
				});
		});
	}

	public getPeer(peerId: string ) {
		return this.peers.get(peerId);
	}

	statusReport() {
		const dura = Math.floor((Date.now() - this.bornTime) / 1000);
		const lastActive = Math.floor((Date.now() - this.activeTime) / 1000);

		return {
			id: this.id,
			peers: [...this.peers.keys()],
			duration: dura,
			lastActive,
			closed: this.closed
		};
	}

	checkDeserted() {
		if (this.checkEmpty()) {
			logger.info('room %s is empty , now close it!', this.id);
			this.close();
			return;
		}

		const lastActive = (Date.now() - this.activeTime) / 1000; // seconds
		if ( lastActive > 2 * 60 * 60 ) { // 2 hours not active
			logger.warn('room %s too long no active!, now close it, lastActive: %s', this.id, lastActive);
			//this.close();
		}
	}

	private setActive() {
		this.activeTime = Date.now();
	}

	private checkEmpty() {
		return this.peers.size === 0;
	}

	private async _handleSocketRequest(peer: Peer, request, cb) {
		switch (request.method) {
			case 'join':
			{
				const {
					displayName,
					picture,
					platform,
				} = request.data;

				if ( peer.joined ) {
					cb(null , {joined: true});
					break;
				}

				peer.displayName = displayName;
				peer.picture = picture;
				peer.platform = platform;

				const peerInfos = new Array<any>();

				this.peers.forEach((joinedPeer) => {
					peerInfos.push(joinedPeer.peerInfo());

				});

				cb(null, { peers: peerInfos, joined: false });

				this._notification(
					peer.socket,
					'newPeer',
					{...peer.peerInfo()},
					true
				);

				logger.debug(
					'peer joined [peer: "%s", displayName: "%s", picture: "%s", platform: "%s"]',
					peer.id, displayName, picture, platform);

				peer.joined = true;
				break;
			}

			case 'sdpOffer':
			{
					const { to } = request.data;
					cb();

					const toPeer = this.getPeer(to);
					this._notification(toPeer?.socket, 'sdpOffer', request.data);
					break;
			}

			case 'sdpAnswer':
			{
					const { to } = request.data;
					cb();

					const toPeer = this.getPeer(to);
					this._notification(toPeer?.socket, 'sdpAnswer', request.data);

					break;
			}

			case 'newIceCandidate':
			{
					const { to } = request.data;
					cb();

					const toPeer = this.getPeer(to);
					this._notification(toPeer?.socket, 'newIceCandidate', request.data);

					break;
			}

			default: 
			{
				logger.error('unknown request.method "%s"', request.method);
				cb(500, `unknown request.method "${request.method}"`);
			}
		}
	}


	_timeoutCallback(callback) {
		let called = false;

		const interval = setTimeout(() => {
				if (called) {
					return;
				}

				called = true;
				callback(new Error('Request timeout.'));
			},
			10000
		);

		return (...args) => {
			if (called) {
				return;
			}

			called = true;
			clearTimeout(interval);

			callback(...args);
		};
	}

	_request(socket: SocketIO.Socket, method: string, data = {}) {
		return new Promise((resolve, reject) => {
			socket.emit(
				'request',
				{ method, data },
				this._timeoutCallback((err, response) => {
					if (err) {
						reject(err);
					}
					else {
						resolve(response);
					}
				})
			);
		});
	}

	_notification(socket, method, data = {}, broadcast = false) {
		if (broadcast) {
			socket.broadcast.to(this.id).emit(
				'notification', { method, data }
			);
		}
		else {
			socket.emit('notification', { method, data });
		}
	}
}
