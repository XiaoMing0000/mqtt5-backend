import {
	AuthenticateException,
	AuthenticateReasonCode,
	DisconnectException,
	DisconnectReasonCode,
	ConnectAckReasonCode,
	PubAckException,
	PubCompReasonCode,
	SubscribeAckReasonCode,
	UnsubscribeAckReasonCode,
	ConnectAckException,
	PubRecException,
} from './exception';
import {
	IConnectData,
	PacketType,
	IMqttOptions,
	PacketTypeData,
	IConnAckData,
	IDisconnectData,
	IDisconnectProperties,
	IPublishData,
	QoSType,
	IPubAckData,
	IPubRecData,
	IPubRelData,
	ISubscribeData,
	ISubAckData,
	IUnsubscribeData,
	IAuthData,
	IPubCompData,
	ProtocolVersion,
} from './interface';
import { TClient, Manager } from './manager/manager';
import {
	encodeConnAck,
	encodeDisconnect,
	encodePublishPacket,
	encodePubControlPacket,
	EncoderProperties,
	encodeVariableByteInteger,
	integerToTwoUint8,
	encodeSubAckPacket,
} from './parse';
import { verifyTopic, isWildcardTopic, topicToRegEx } from './topicFilters';
import { generateClientIdentifier } from './utils';

/**
 * Per-connection MQTT control-plane logic: validates inbound packets, emits application events,
 * and encodes outbound packets for one client.
 *
 * @remarks
 * **Handler naming**
 * - Server receives from client: `{packetType}Handle` (e.g. {@link MqttManager.connectHandle}, {@link MqttManager.publishHandle}).
 * - Server sends to client: `handle{PacketType}` (e.g. {@link MqttManager.handleConnAck}, {@link MqttManager.handleDisconnect}, {@link MqttManager.handlePublish}).
 *
 * **QoS 1/2 recovery**
 * A static map stores incomplete outbound publishes / PUBREL state per client id so sessions can resume after `cleanStart: false`.
 */
export class MqttManager {
	/** Outbound QoS 1/2 state keyed by client identifier (publish snapshot or pubrel placeholder) for session resume. */
	private static readonly outboundStore = new Map<string, Map<number, { type: 'publish' | 'pubrel'; publish?: IPublishData }>>();
	topicAliasNameMap: { [key: number]: string } = {};
	receiveCounter = 0;
	clientIdentifier = '';
	isAuth = false;
	private authMethod?: string;
	private authDone = true;
	private inboundQoS2: Set<number> = new Set();
	protected connData: IConnectData = {
		header: {
			packetType: PacketType.RESERVED,
			packetFlags: 0,
			remainingLength: 0,
			protocolName: '',
			protocolVersion: 0,
			keepAlive: 0,
		},
		connectFlags: {} as any,
		properties: {},
		payload: {
			clientIdentifier: '',
		},
	};
	private errorDisconnect = true;
	/**
	 * @param client - Underlying socket/session used to read and write MQTT frames.
	 * @param clientManager - Broker-side registry for sessions, subscriptions, and identifiers.
	 * @param options - Feature flags and limits advertised in CONNACK and enforced on publish/subscribe.
	 */
	constructor(
		private readonly client: TClient,
		private readonly clientManager: Manager,
		private readonly options: IMqttOptions,
	) {}
	/**
	 * Returns the outbound recovery queue for a client, creating it if missing.
	 *
	 * @param clientIdentifier - MQTT client identifier.
	 * @returns The per-client map of packet identifier → queued outbound item.
	 */
	private getOutboundQueue(clientIdentifier: string) {
		let queue = MqttManager.outboundStore.get(clientIdentifier);
		if (!queue) {
			queue = new Map();
			MqttManager.outboundStore.set(clientIdentifier, queue);
		}
		return queue;
	}
	/**
	 * Drops all queued outbound state for a client (e.g. on clean start).
	 *
	 * @param clientIdentifier - MQTT client identifier.
	 */
	private clearOutboundQueue(clientIdentifier: string) {
		MqttManager.outboundStore.delete(clientIdentifier);
	}
	/**
	 * Re-sends unfinished QoS 1 publishes (with DUP) and completes QoS 2 PUBREL legs after reconnect.
	 *
	 * @param clientIdentifier - MQTT client identifier whose queue should be replayed.
	 */
	private async restoreOutboundQueue(clientIdentifier: string) {
		const queue = MqttManager.outboundStore.get(clientIdentifier);
		if (!queue || !queue.size) {
			return;
		}
		for (const [packetIdentifier, item] of queue.entries()) {
			if (item.type === 'publish' && item.publish) {
				const replayData: IPublishData = JSON.parse(JSON.stringify(item.publish));
				replayData.header.packetIdentifier = packetIdentifier;
				replayData.header.dupFlag = true;
				const packet = encodePublishPacket(replayData, this.connData.header.protocolVersion);
				this.client.write(packet);
			} else if (item.type === 'pubrel') {
				await this.handlePubRel({
					header: {
						packetType: PacketType.PUBREC,
						packetIdentifier,
						received: 0x00,
						reasonCode: 0x00,
					},
					properties: {},
				});
			}
		}
	}
	/**
	 * Enforces that non-AUTH packets are rejected while an authentication exchange is in progress.
	 *
	 * @param data - Decoded packet header and payload envelope.
	 * @throws {@link DisconnectException} When AUTH is required but another packet type arrives.
	 */
	public async commonHandle(data: PacketTypeData) {
		if (!this.authDone && data.header.packetType !== PacketType.AUTH) {
			throw new DisconnectException('AUTH exchange in progress.', DisconnectReasonCode.ProtocolError);
		}
	}
	/**
	 * Sends a CONNACK to the client with negotiated limits and session presence.
	 *
	 * @param connData - CONNECT payload used for assigned client id and session flags.
	 * @param reasonCode - CONNACK reason code; defaults to success.
	 * @param reasonString - Optional MQTT 5 reason string.
	 * @remarks
	 * If `requestProblemInformation` is 0, user-facing properties must be omitted per spec (not fully applied here).
	 */
	public async handleConnAck(connData: IConnectData, reasonCode?: ConnectAckReasonCode, reasonString?: string) {
		const connAckData: IConnAckData = {
			header: {
				packetType: PacketType.CONNACK,
				reserved: 0x00,
				reasonCode: reasonCode ?? 0x00,
			},
			acknowledgeFlags: {
				SessionPresent: false,
			},
			properties: {
				reasonString,
			},
		};
		if (!this.options.retainAvailable) {
			connAckData.properties.retainAvailable = false;
		}
		if (this.connData.connectFlags.cleanStart) {
			connAckData.acknowledgeFlags.SessionPresent = false;
		} else {
			connAckData.acknowledgeFlags.SessionPresent = await this.clientManager.hasSession(this.connData.payload.clientIdentifier);
		}
		if (!this.connData.properties.requestProblemInformation) {
			// MQTT 5: only when Request Problem Information is 0 may user-facing properties be omitted (§3.1.2.11.7).
		}
		connAckData.properties = {
			receiveMaximum: this.options.receiveMaximum,
			maximumPacketSize: this.options.maximumPacketSize,
		};
		if (this.options.wildcardSubscriptionAvailable === false) {
			connAckData.properties.wildcardSubscriptionAvailable = false;
		}
		if (this.options.subscriptionIdentifierAvailable === false) {
			connAckData.properties.subscriptionIdentifierAvailable = false;
		}
		if (this.options.topicAliasMaximum) {
			connAckData.properties.topicAliasMaximum = this.options.topicAliasMaximum;
		}
		if (this.options.retainAvailable !== false) {
			connAckData.properties.retainAvailable = true;
		}
		if (this.options.maximumQoS !== QoSType.QoS2) {
			connAckData.properties.maximumQoS = !!this.options.maximumQoS;
		}
		if (this.options.sharedSubscriptionAvailable === false) {
			connAckData.properties.sharedSubscriptionAvailable = false;
		}
		if ((this.options.serverKeepAlive ?? 0) > 0) {
			connAckData.properties.serverKeepAlive = this.options.serverKeepAlive;
		}
		if (!this.clientIdentifier) {
			// Server-assigned id when the client sent none (or it was generated in connectHandle).
			connAckData.properties.assignedClientIdentifier = connData.payload.clientIdentifier;
			this.clientIdentifier = connData.payload.clientIdentifier;
		}
		const connPacket = encodeConnAck(connAckData, this.connData.header.protocolVersion);
		this.client.write(connPacket);
		if (reasonCode === ConnectAckReasonCode.UnsupportedProtocolVersion) {
			this.client.end();
		}
	}
	/**
	 * Handles an inbound CONNECT: validates options, may start AUTH, registers the client, and sends CONNACK.
	 *
	 * @param connData - Parsed CONNECT packet.
	 * @param emitAsync - Optional hook to await application `connect` handler; failure aborts with disconnect.
	 * @throws {@link ConnectAckException} When client id is invalid and auto-assignment is disabled.
	 * @throws {@link DisconnectException} On unsupported protocol version or failed `emitAsync`.
	 */
	public async connectHandle(connData: IConnectData, emitAsync?: (client: TClient, event: string, ...args: any[]) => Promise<boolean>) {
		this.connData = connData;
		if (!connData.payload.clientIdentifier) {
			if (this.options.automaticallyAssignedClientIdentifier !== false) {
				connData.payload.clientIdentifier = generateClientIdentifier();
			} else {
				throw new ConnectAckException('Client Identifier not valid', ConnectAckReasonCode.ClientIdentifierNotValid);
			}
		}
		if (!this.options.protocolVersions?.includes(connData.header.protocolVersion)) {
			throw new DisconnectException('Unsupported Protocol Version.', DisconnectReasonCode.ProtocolError);
		}
		if (this.connData.connectFlags.cleanStart) {
			await this.clientManager.clearSubscribe(connData.payload.clientIdentifier);
			this.receiveCounter = 0;
			this.inboundQoS2.clear();
			this.clearOutboundQueue(connData.payload.clientIdentifier);
		}
		if (
			this.connData.properties.authenticationMethod &&
			!['none', 'null', 'undefined', '0', 'off', 'disable', 'no', 'n/a', 'anonymous', 'basic', 'empty', 'noauth', 'skip'].includes(
				this.connData.properties.authenticationMethod,
			)
		) {
			this.isAuth = true;
			this.authDone = false;
			this.authMethod = this.connData.properties.authenticationMethod;
		}
		this.connData.properties.receiveMaximum ??= this.options.receiveMaximum ?? 0xffff;
		const targetId = this.clientIdentifier || connData.payload.clientIdentifier;
		const existingClient = this.clientManager.clientIdentifierManager.getIdentifier(targetId);
		if (existingClient && existingClient !== this.client) {
			const takeoverDisconnect = encodeDisconnect({
				header: {
					packetType: PacketType.DISCONNECT,
					received: 0,
					remainingLength: 0,
					reasonCode: DisconnectReasonCode.SessionTakenOver,
				},
				properties: {},
			});
			existingClient.end(Buffer.from(takeoverDisconnect));
			this.clientManager.clearConnect(existingClient);
		}
		if (emitAsync && !(await emitAsync(this.client, 'connect', this.connData, this.client, this.clientManager))) {
			throw new DisconnectException('Client connection failed.', DisconnectReasonCode.UnspecifiedError);
		}
		await this.handleConnAck(this.connData);
		await this.clientManager.connect(targetId, connData, this.client);
		this.clientIdentifier = targetId;
		if (!this.connData.connectFlags.cleanStart) {
			await this.restoreOutboundQueue(targetId);
		}
		if (this.isAuth && !this.authDone) {
			await this.handleAuthPacket(AuthenticateReasonCode.ContinueAuthentication, this.authMethod, this.connData.properties.authenticationData);
		}
	}
	/**
	 * Handles an inbound DISCONNECT from the client and closes the transport.
	 *
	 * @param disconnectData - Parsed DISCONNECT packet.
	 */
	public async disconnectHandle(disconnectData: IDisconnectData) {
		if (disconnectData.header.reasonCode === 0) {
			this.errorDisconnect = false;
		}
		this.client.end();
	}
	/**
	 * Sends a server-initiated DISCONNECT and closes the connection.
	 *
	 * @param reasonCode - DISCONNECT reason code.
	 * @param properties - MQTT 5 disconnect properties.
	 */
	public async handleDisconnect(reasonCode: DisconnectReasonCode, properties: IDisconnectProperties) {
		const disconnectPacket = encodeDisconnect({
			header: {
				packetType: PacketType.DISCONNECT,
				received: 0,
				remainingLength: 0,
				reasonCode: reasonCode,
			},
			properties: properties,
		});
		this.client.end(Buffer.from(disconnectPacket));
	}
	/**
	 * Responds to PINGREQ with PINGRESP and refreshes liveness in the manager.
	 */
	public async pingReqHandle() {
		await this.clientManager.ping(this.clientIdentifier);
		this.client.write(Buffer.from([PacketType.PINGRESP << 4, 0]));
	}
	/**
	 * Updates server-side last-activity / keep-alive tracking without sending a PINGRESP.
	 */
	public async updateKeepaliveTime() {
		await this.clientManager.ping(this.clientIdentifier);
	}
	/**
	 * Schedules or sends the will message after an abnormal disconnect (subject to will delay and expiry).
	 *
	 * @remarks
	 * TODO: Full retained-will lifecycle (store when no subscribers, expiry, distinction vs ordinary retain) is not implemented here.
	 */
	public async publishWillMessage() {
		if (this.connData.connectFlags.willFlag && this.errorDisconnect) {
			const willPayload = this.connData.payload.willPayload;
			const willData: IPublishData = {
				header: {
					packetType: PacketType.PUBLISH,
					dupFlag: false,
					qosLevel: this.connData.connectFlags.willQoS,
					retain: this.connData.connectFlags.willRetain,
					remainingLength: 0,
					topicName: this.connData.payload.willTopic || '',
				},
				properties: this.connData.payload.willProperties || {},
				payload: willPayload ? willPayload.toString() : '',
			};
			const delayInterval = this.connData.payload.willProperties?.willDelayInterval ?? 0;
			const messageExpiry = this.connData.payload.willProperties?.messageExpiryInterval ?? 0;
			const disconnectedAt = Date.now();
			if (delayInterval > 0) {
				// Fire-and-forget so the will delay does not block the disconnect path.
				setTimeout(() => {
					if (this.clientIdentifier && !this.clientManager.clientIdentifierManager.getIdentifier(this.clientIdentifier)) {
						if (messageExpiry > 0 && Date.now() > disconnectedAt + messageExpiry * 1000) {
							return;
						}
						this.sendWillMessage(willData);
					}
				}, delayInterval * 1000);
			} else {
				if (messageExpiry > 0 && Date.now() > disconnectedAt + messageExpiry * 1000) {
					return;
				}
				this.sendWillMessage(willData);
			}
		}
	}
	/**
	 * Publishes the will through the broker with a new packet identifier when QoS is not QoS0.
	 *
	 * @param willData - Will as a normal outbound publish.
	 */
	private sendWillMessage(willData: IPublishData) {
		if (this.connData.connectFlags.willQoS > QoSType.QoS0) {
			willData.header.packetIdentifier = this.clientManager.newPacketIdentifier(this.client);
		}
		this.clientManager.publish(this.clientIdentifier, willData.header.topicName, willData);
	}
	/**
	 * Validates and forwards an inbound PUBLISH from the client; sends PUBACK/PUBREC as required.
	 *
	 * @param pubData - Parsed PUBLISH from the client.
	 * @param emitAsync - Application hook for `publish`; if it returns false, processing stops before fan-out.
	 * @returns `false` when `emitAsync` rejects delivery; otherwise void.
	 * @throws {@link DisconnectException} On policy violations (QoS, receive max, packet size, topic alias, retain).
	 * @throws {@link PubAckException} / {@link PubRecException} When mapped from application errors for QoS 1/2.
	 */
	public async publishHandle(pubData: IPublishData, emitAsync: (client: TClient, event: string, ...args: any[]) => Promise<boolean>) {
		try {
			if (pubData.properties.topicAlias && pubData.properties.topicAlias > (this.options.topicAliasMaximum ?? 0xffff)) {
				throw new DisconnectException(
					'A Client MUST accept all Topic Alias values greater than 0 and less than or equal to the Topic Alias Maximum value that it sent in the CONNECT packet.',
					DisconnectReasonCode.TopicAliasInvalid,
				);
			}
			if (pubData.header.qosLevel > (this.options.maximumQoS ?? QoSType.QoS0)) {
				throw new DisconnectException('The Client specified a QoS greater than the QoS specified in a Maximum QoS in the CONNACK.', DisconnectReasonCode.QoSNotSupported);
			}
			if (pubData.header.qosLevel > QoSType.QoS0) {
				this.receiveCounter++;
				if (this.receiveCounter > (this.connData.properties.receiveMaximum ?? 0xffff)) {
					throw new DisconnectException(
						'The Client MUST NOT send more than Receive Maximum QoS 1 and QoS 2 PUBLISH packets for which it has not received PUBACK, PUBCOMP, or PUBREC with a Reason Code of 128 or greater from the Server.',
						DisconnectReasonCode.ReceiveMaximumExceeded,
					);
				}
			}
			if (this.connData.properties.maximumPacketSize && (pubData.header.remainingLength ?? 0) > (this.connData.properties.maximumPacketSize ?? 1 << 20)) {
				throw new DisconnectException(
					'The Server has received a Control Packet during the current Connection that contains more data than it was willing to process.',
					DisconnectReasonCode.PacketTooLarge,
				);
			}
			if (pubData.properties.topicAlias) {
				if (this.options.topicAliasMaximum && pubData.properties.topicAlias > (this.options.topicAliasMaximum ?? 0xffff)) {
					throw new DisconnectException(
						'The Client or Server has received a PUBLISH packet containing a Topic Alias which is greater than the Maximum Topic Alias it sent in the CONNECT or CONNACK packet.',
						DisconnectReasonCode.TopicAliasInvalid,
					);
				}
				if (pubData.header.topicName) {
					this.topicAliasNameMap[pubData.properties.topicAlias] = pubData.header.topicName;
				} else {
					pubData.header.topicName = this.topicAliasNameMap[pubData.properties.topicAlias];
				}
			}
			// QoS 2 dedup: duplicate packet id only gets PUBREC again, not re-delivered upstream.
			if (pubData.header.qosLevel === QoSType.QoS2 && pubData.header.packetIdentifier !== undefined) {
				if (this.inboundQoS2.has(pubData.header.packetIdentifier)) {
					const pubRecData: IPubRecData = {
						header: {
							packetType: PacketType.PUBREC,
							packetIdentifier: pubData.header.packetIdentifier,
							received: 0x00,
							reasonCode: 0x00,
						},
						properties: {},
					};
					await this.handlePubRec(pubRecData);
					return;
				}
				this.inboundQoS2.add(pubData.header.packetIdentifier);
			}
			if (!(await emitAsync(this.client, 'publish', pubData, this.client, this.clientManager))) {
				return false;
			}
			if (pubData.properties.messageExpiryInterval && pubData.properties.messageExpiryInterval > 0) {
				pubData.properties.messageExpiryTimestamp = Date.now() + pubData.properties.messageExpiryInterval * 1000;
			}
			if (pubData.header.retain) {
				if (this.options.retainAvailable === false) {
					throw new DisconnectException('The Server does not support retained messages, and Will Retain was set to 1.', DisconnectReasonCode.RetainNotSupported);
				}
				if (pubData.payload) {
					this.clientManager.addRetainMessage(pubData.header.topicName, pubData, this.options.retainTTL);
				} else {
					this.clientManager.deleteRetainMessage(pubData.header.topicName);
				}
			}
		} catch (err: any) {
			// For inbound QoS2, surface application errors as PUBREC reason codes (not PUBACK).
			if (err instanceof PubAckException) {
				if (pubData.header.qosLevel === QoSType.QoS2) {
					throw new PubRecException(err.code as any, err.code as any);
				} else {
					throw err;
				}
			} else {
				throw err;
			}
		}
		delete pubData.properties.topicAlias;
		this.clientManager.publish(this.clientIdentifier, pubData.header.topicName, pubData);
		if (pubData.header.qosLevel === QoSType.QoS1) {
			const pubAckData: IPubAckData = {
				header: {
					packetType: PacketType.PUBACK,
					packetIdentifier: pubData.header.packetIdentifier ?? 0,
					received: 0x00,
					reasonCode: 0x00,
				},
				properties: {},
			};
			await this.handlePubAck(pubAckData);
			this.receiveCounter--;
		} else if (pubData.header.qosLevel === QoSType.QoS2) {
			const pubRecData: IPubRecData = {
				header: {
					packetType: PacketType.PUBREC,
					packetIdentifier: pubData.header.packetIdentifier ?? 0,
					received: 0x00,
					reasonCode: 0x00,
				},
				properties: {},
			};
			await this.handlePubRec(pubRecData);
		}
	}
	/**
	 * Encodes and sends a PUBLISH to a client, queuing outbound QoS state for session recovery.
	 *
	 * @param client - Target client connection.
	 * @param pubData - Publish to deliver (packet id assigned when QoS is QoS1 or QoS2).
	 */
	public async handlePublish(client: TClient, pubData: IPublishData) {
		let targetPacketIdentifier: number | undefined;
		if (pubData.header.qosLevel > QoSType.QoS0) {
			pubData.header.packetIdentifier = this.clientManager.newPacketIdentifier(client);
			targetPacketIdentifier = pubData.header.packetIdentifier;
			pubData.header.dupFlag = false;
			const targetIdentifier = this.clientManager.clientIdentifierManager.getClient(client)?.identifier;
			if (targetIdentifier && pubData.header.packetIdentifier !== undefined) {
				const queue = this.getOutboundQueue(targetIdentifier);
				queue.set(pubData.header.packetIdentifier, {
					type: 'publish',
					publish: JSON.parse(JSON.stringify(pubData)),
				});
			}
		}
		pubData.header.retain = false;
		const pubPacket = encodePublishPacket(pubData, this.connData.header.protocolVersion);
		client.write(pubPacket);
		if (targetPacketIdentifier !== undefined) {
			this.clientManager.registerPendingPacket(client, targetPacketIdentifier, pubPacket, 'publish');
		}
	}
	/**
	 * Sends PUBACK to the connected client.
	 *
	 * @param pubAckData - PUBACK payload and reason.
	 */
	async handlePubAck(pubAckData: IPubAckData) {
		const pubAckPacket = encodePubControlPacket(pubAckData, this.connData.header.protocolVersion);
		this.client.write(pubAckPacket);
	}
	/**
	 * Sends PUBREC to the connected client.
	 *
	 * @param pubRecData - PUBREC payload and reason.
	 */
	async handlePubRec(pubRecData: IPubRecData) {
		const pubRecPacket = encodePubControlPacket(pubRecData, this.connData.header.protocolVersion);
		this.client.write(pubRecPacket);
	}
	/**
	 * Processes an inbound PUBACK from the client: validates id, frees identifier, drops outbound queue entry.
	 *
	 * @param pubAckData - Client PUBACK.
	 * @throws {@link DisconnectException} If the packet identifier is unknown.
	 */
	public async pubAckHandle(pubAckData: IPubAckData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubAckData.header.packetIdentifier)) {
			throw new DisconnectException('PUBACK contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		this.clientManager.deletePacketIdentifier(this.client, pubAckData.header.packetIdentifier);
		if (this.clientIdentifier) {
			this.getOutboundQueue(this.clientIdentifier).delete(pubAckData.header.packetIdentifier);
		}
	}
	/**
	 * Finishes inbound QoS 2 after PUBREL: clears dedup state, decrements receive quota, sends PUBCOMP.
	 *
	 * @param pubRelData - Client PUBREL (same id as PUBREC).
	 */
	public async pubRelHandle(pubRelData: IPubRelData) {
		this.inboundQoS2.delete(pubRelData.header.packetIdentifier);
		this.receiveCounter = Math.max(0, this.receiveCounter - 1);
		await this.handlePubComp(pubRelData as any);
	}
	/**
	 * Sends PUBCOMP to the connected client (MQTT 5 includes property length when applicable).
	 *
	 * @param pubCompData - Packet id and reason for PUBCOMP.
	 */
	async handlePubComp(pubCompData: IPubCompData) {
		const properties = new EncoderProperties();
		const compPacket = Buffer.from([
			PacketType.PUBCOMP << 4,
			...encodeVariableByteInteger(3 + (this.connData.header.protocolVersion === ProtocolVersion.V5 ? properties.length : 0)),
			...integerToTwoUint8(pubCompData.header.packetIdentifier),
			PubCompReasonCode.Success,
			...(this.connData.header.protocolVersion === ProtocolVersion.V5 ? properties.buffer : []),
		]);
		this.client.write(compPacket);
	}
	/**
	 * Handles inbound PUBREC from the client: transitions outbound queue to pubrel and sends PUBREL.
	 *
	 * @param pubRecData - Client PUBREC for a server-originated publish.
	 * @throws {@link DisconnectException} If the packet identifier is unknown.
	 */
	public async pubRecHandle(pubRecData: IPubRecData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubRecData.header.packetIdentifier)) {
			throw new DisconnectException('PUBREC contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		if (this.clientIdentifier) {
			const queue = this.getOutboundQueue(this.clientIdentifier);
			if (queue.has(pubRecData.header.packetIdentifier)) {
				queue.set(pubRecData.header.packetIdentifier, { type: 'pubrel' });
			}
		}
		await this.handlePubRel(pubRecData);
	}
	/**
	 * Encodes PUBREL with flags bit 1 set and updates pending-packet tracking to the PUBREL frame.
	 *
	 * @param pubRecData - Uses packet identifier from the PUBREC leg.
	 */
	private async handlePubRel(pubRecData: IPubRecData) {
		const properties = new EncoderProperties();
		const pubRelPacket = Buffer.from([
			(PacketType.PUBREL << 4) | 0x02,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(pubRecData.header.packetIdentifier),
			PubCompReasonCode.Success,
			...properties.buffer,
		]);
		this.client.write(pubRelPacket);
		this.clientManager.promotePendingToPubRel(this.client, pubRecData.header.packetIdentifier, pubRelPacket);
	}
	/**
	 * Handles inbound PUBCOMP: frees packet identifier and removes outbound queue entry.
	 *
	 * @param pubCompData - Client PUBCOMP.
	 * @throws {@link DisconnectException} If the packet identifier is unknown.
	 */
	public async pubCompHandle(pubCompData: IPubRecData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubCompData.header.packetIdentifier)) {
			throw new DisconnectException('PUBCOMP contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		this.clientManager.deletePacketIdentifier(this.client, pubCompData.header.packetIdentifier);
		if (this.clientIdentifier) {
			this.getOutboundQueue(this.clientIdentifier).delete(pubCompData.header.packetIdentifier);
		}
	}
	/**
	 * Applies SUBSCRIBE: validates options, may deliver retained messages, registers subscriptions, sends SUBACK.
	 *
	 * @param subData - Parsed SUBSCRIBE from the client.
	 * @throws {@link DisconnectException} When subscription identifiers are disabled but present, or on other policy errors from callees.
	 */
	public async subscribeHandle(subData: ISubscribeData) {
		if (this.options.subscriptionIdentifierAvailable === false) {
			throw new DisconnectException('Subscription Identifiers not supported.', DisconnectReasonCode.SubscriptionIdentifiersNotSupported);
		}
		const payloads = subData.payloads?.length
			? subData.payloads
			: [
					{
						topicFilter: subData.payload,
						options: subData.options,
					},
				];
		const reasonCodes: SubscribeAckReasonCode[] = [];
		for (const entry of payloads) {
			let topicFilter = entry.topicFilter;
			const options = entry.options;
			let sharedGroup: string | undefined;
			if (topicFilter.startsWith('$share/')) {
				if (this.options.sharedSubscriptionAvailable === false) {
					reasonCodes.push(SubscribeAckReasonCode.SharedSubscriptionsNotSupported);
					continue;
				}
				const match = /^\$share\/([^/]+)\/(.+)$/.exec(topicFilter);
				if (!match) {
					reasonCodes.push(SubscribeAckReasonCode.TopicFilterInvalid);
					continue;
				}
				sharedGroup = match[1];
				topicFilter = match[2];
			}
			if (!this.options.wildcardSubscriptionAvailable && isWildcardTopic(topicFilter)) {
				reasonCodes.push(SubscribeAckReasonCode.WildcardSubscriptionsNotSupported);
				continue;
			}
			const topic = verifyTopic(topicFilter);
			if (!topic) {
				reasonCodes.push(SubscribeAckReasonCode.TopicFilterInvalid);
				continue;
			}
			if (
				this.options.retainAvailable !== false &&
				(options.retainHandling == 0 || (options.retainHandling == 1 && !(await this.clientManager.isSubscribe(this.clientIdentifier, topicFilter))))
			) {
				if (!isWildcardTopic(topicFilter)) {
					const retainData = await this.clientManager.getRetainMessage(topicFilter);
					if (retainData) {
						retainData.header.qosLevel = Math.min(retainData.header.qosLevel, options.qos);
						await this.handlePublish(this.client, retainData);
					}
				} else {
					const reg = topicToRegEx(topicFilter);
					if (reg) {
						const topicRegEx = new RegExp(reg);
						await this.clientManager.forEachRetainMessage(async (topicName, data) => {
							if (topicRegEx.test(topicName)) {
								data.header.qosLevel = Math.min(data.header.qosLevel, options.qos);
								await this.handlePublish(this.client, data);
							}
						}, topicFilter);
					}
				}
			}
			await this.clientManager.subscribe(this.clientIdentifier, topicFilter, {
				qos: options.qos,
				date: new Date(),
				subscriptionIdentifier: subData.properties.subscriptionIdentifier,
				noLocal: options.noLocal,
				retainAsPublished: options.retainAsPublished,
				protocolVersion: this.connData.header.protocolVersion,
				sharedGroup,
			});
			reasonCodes.push(options.qos as unknown as SubscribeAckReasonCode);
		}
		const subAckData: ISubAckData = {
			header: {
				packetType: PacketType.SUBACK,
				retain: 0x00,
				packetIdentifier: subData.header.packetIdentifier,
			},
			properties: {},
			reasonCode: reasonCodes[0] ?? SubscribeAckReasonCode.UnspecifiedError,
			reasonCodes,
		};
		this.handleSubAck(subAckData);
	}
	/**
	 * Sends SUBACK to the connected client.
	 *
	 * @param subAckData - Per-subscription reason codes and packet id.
	 */
	public async handleSubAck(subAckData: ISubAckData) {
		const subAckPacket = encodeSubAckPacket(subAckData, this.connData.header.protocolVersion);
		this.client.write(subAckPacket);
	}
	/**
	 * Handles UNSUBSCRIBE: removes subscriptions and sends UNSUBACK with per-topic reason codes.
	 *
	 * @param unsubscribeData - Parsed UNSUBSCRIBE from the client.
	 */
	public async unsubscribeHandle(unsubscribeData: IUnsubscribeData) {
		const payloads = unsubscribeData.payloads?.length ? unsubscribeData.payloads : [unsubscribeData.payload];
		const reasonCodes: number[] = [];
		for (const topicFilter of payloads) {
			const topic = verifyTopic(topicFilter);
			if (!topic) {
				reasonCodes.push(SubscribeAckReasonCode.TopicFilterInvalid);
				continue;
			}
			await this.clientManager.unsubscribe(this.clientIdentifier, topicFilter);
			reasonCodes.push(UnsubscribeAckReasonCode.Success);
		}
		this.handleUnsubscribeAck(unsubscribeData, this.connData.header.protocolVersion, reasonCodes);
	}
	/**
	 * Encodes and sends UNSUBACK for a given unsubscribe request.
	 *
	 * @param unsubscribeData - Original UNSUBSCRIBE (for packet identifier).
	 * @param protocolVersion - MQTT protocol version (affects property encoding).
	 * @param reasonCodes - One reason byte per topic filter; defaults to success.
	 */
	public async handleUnsubscribeAck(unsubscribeData: IUnsubscribeData, protocolVersion: ProtocolVersion, reasonCodes: number[] = [UnsubscribeAckReasonCode.Success]) {
		let remainingLength = reasonCodes.length;
		const properties = new EncoderProperties();
		remainingLength += (this.connData.header.protocolVersion === ProtocolVersion.V5 ? properties.length : 0) + 2;
		const unsubscribePacket = Buffer.from([
			PacketType.UNSUBACK << 4,
			...encodeVariableByteInteger(remainingLength),
			...integerToTwoUint8(unsubscribeData.header.packetIdentifier),
			...(protocolVersion === ProtocolVersion.V5 ? properties.buffer : []),
			...reasonCodes,
		]);
		this.client.write(unsubscribePacket);
	}
	/**
	 * Sends an AUTH control packet to continue or complete extended authentication.
	 *
	 * @param reasonCode - AUTH reason (e.g. continue or success).
	 * @param authenticationMethod - Optional method name echo.
	 * @param authenticationData - Optional opaque challenge/response payload.
	 */
	private async handleAuthPacket(reasonCode: AuthenticateReasonCode, authenticationMethod?: string, authenticationData?: string) {
		const properties = new EncoderProperties();
		if (authenticationMethod) {
			properties.push({ authenticationMethod });
		}
		if (authenticationData) {
			properties.push({ authenticationData });
		}
		const packet = Buffer.from([PacketType.AUTH << 4, ...encodeVariableByteInteger(1 + properties.length), reasonCode, ...properties.buffer]);
		this.client.write(packet);
	}
	/**
	 * Handles an inbound AUTH from the client during extended authentication.
	 *
	 * @param authData - Parsed AUTH packet.
	 * @throws {@link AuthenticateException} When AUTH is not enabled or method mismatches.
	 */
	public async authHandle(authData: IAuthData) {
		if (!this.isAuth) {
			throw new AuthenticateException('AUTH is not enabled for this connection.', AuthenticateReasonCode.Reauthenticate);
		}
		if (authData.properties.authenticationMethod && this.authMethod && authData.properties.authenticationMethod !== this.authMethod) {
			throw new AuthenticateException('Authentication method mismatch.', AuthenticateReasonCode.Reauthenticate);
		}
		this.authDone = authData.header.reasonCode === AuthenticateReasonCode.Success;
		if (!this.authDone) {
			await this.handleAuthPacket(AuthenticateReasonCode.ContinueAuthentication, this.authMethod, authData.properties.authenticationData);
		}
	}
}
