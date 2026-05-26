import net from 'net';
import { IConnectData, IPublishData, PacketType, ProtocolVersion, QoSType } from '../interface';

/** MQTT topic filter or name (string). */
export type TTopic = string;
/** Underlying TCP socket for a connected MQTT client. */
export type TClient = net.Socket;
/** Stable client identifier string (MQTT Client ID). */
export type TIdentifier = string;
type TClientID = { identifier: TIdentifier; packetIdentifier: Set<number>; dynamicId: number };
/** Maps each live socket to its client id, outbound packet-ids in use, and id allocator state. */
export type TClientMap = Map<TClient, TClientID>;
/** Maps client identifier string to the active socket, if any. */
export type TIdentifierMap = Map<TIdentifier, TClient>;
/** Maps each socket to its client identifier string (convenience view). */
export type ClientIdentifierMap = Map<TClient, string>;

/** Per-topic subscription options for a client (QoS, MQTT 5 options, protocol version). */
export type TSubscribeData = {
	qos: QoSType;
	date: Date;
	subscriptionIdentifier?: number | Array<number>;
	noLocal: boolean;
	retainAsPublished: boolean;
	protocolVersion: ProtocolVersion;
	sharedGroup?: string;
};
/** Map from topic (or filter) to subscription metadata for one client. */
export type TClientSubscription = Map<TTopic, TSubscribeData>;

/**
 * Bidirectional registry of MQTT clients: socket ↔ client identifier, plus per-socket packet identifier bookkeeping.
 *
 * @remarks
 * Used to look up connections by id or socket, and to allocate/recycle 16-bit packet identifiers for outbound server→client traffic.
 */
export class ClientIdentifierManager {
	private readonly clientMap: TClientMap;
	private readonly identifierMap: TIdentifierMap;
	constructor() {
		this.clientMap = new Map();
		this.identifierMap = new Map();
	}

	/**
	 * @param key - Client socket or identifier string.
	 * @returns Whether the given socket or identifier is registered.
	 */
	has(key: TClient | TIdentifier) {
		if (typeof key === 'string') {
			return this.identifierMap.has(key);
		}
		return this.clientMap.has(key);
	}

	/**
	 * @param client - Connected socket.
	 * @returns Per-socket state (identifier, packet ids, allocator), if registered.
	 */
	getClient(client: TClient) {
		return this.clientMap.get(client);
	}
	/**
	 * @param identifier - Client identifier string.
	 * @returns The socket for that id, if connected.
	 */
	getIdentifier(identifier: TIdentifier) {
		return this.identifierMap.get(identifier);
	}

	/**
	 * Registers a client: associates identifier with socket and initializes packet-id tracking.
	 *
	 * @param key - Client identifier.
	 * @param value - Connected socket.
	 */
	set(key: TIdentifier, value: TClient): void {
		this.identifierMap.set(key, value);
		this.clientMap.set(value, { identifier: key, packetIdentifier: new Set(), dynamicId: 1 });
	}

	/**
	 * Removes a client by socket or by identifier string.
	 *
	 * @param key - Socket or client identifier.
	 * @returns Whether an entry was removed.
	 */
	delete(key: TClient | TIdentifier) {
		if (typeof key === 'string') {
			const client = this.identifierMap.get(key);
			if (client) {
				this.clientMap.delete(client);
			}
			return this.identifierMap.delete(key);
		} else {
			const client = this.clientMap.get(key);
			if (client) {
				this.identifierMap.delete(client.identifier);
			}
			return this.clientMap.delete(key);
		}
	}

	/** Removes all client registrations. */
	clear() {
		this.clientMap.clear();
		this.identifierMap.clear();
	}

	/** Number of registered clients (same as identifier map size). */
	get size() {
		return this.clientMap.size;
	}

	/**
	 * @returns Iterator over registered sockets.
	 */
	clientKeys() {
		return this.clientMap.keys();
	}

	/**
	 * @returns Iterator over registered client identifier strings.
	 */
	identifierKeys() {
		return this.identifierMap.keys();
	}

	/**
	 * @returns Iterator over per-socket state objects.
	 */
	clientValues() {
		return this.clientMap.values();
	}
	/**
	 * @returns Iterator over sockets (values of identifier map).
	 */
	identifierValues() {
		return this.identifierMap.values();
	}

	/**
	 * @param callbackfn - Called for each socket and its state.
	 */
	clientForEarch(callbackfn: (value: TClientID, key: TClient, map: Map<TClient, TClientID>) => void) {
		this.clientMap.forEach(callbackfn);
	}

	/**
	 * @param callbackfn - Called for each identifier and its socket.
	 */
	identifierForeEach(callbackfn: (value: TClient, key: TIdentifier, map: Map<TIdentifier, TClient>) => void) {
		this.identifierMap.forEach(callbackfn);
	}

	/**
	 * Iterates packet identifiers currently allocated for outbound traffic to this client.
	 *
	 * @param client - Connected socket.
	 * @returns Iterator of packet ids, or `undefined` if the client is unknown.
	 */
	public getPacketIdentifierValues(client: TClient) {
		return this.clientMap.get(client)?.packetIdentifier.values();
	}

	/**
	 * Allocates the next unused 16-bit packet identifier for server→client publishes (and related control).
	 *
	 * @remarks
	 * Used when the broker sends PUBLISH (or similar) to the client and must track the id until PUBACK/PUBREC/PUBCOMP completes.
	 *
	 * @param client - Target socket.
	 * @returns New packet id in 1..65535, or `0` if the client is not registered.
	 */
	public newPacketIdentifier(client: TClient) {
		let newPacketIdentifier = 0;
		const manager = this.clientMap.get(client);
		if (manager) {
			do {
				newPacketIdentifier = manager.dynamicId++ & 0xffff;
			} while (manager.packetIdentifier.has(newPacketIdentifier) && !newPacketIdentifier);
			manager.packetIdentifier.add(newPacketIdentifier);
		}
		return newPacketIdentifier;
	}

	/**
	 * Releases a packet identifier after the publish flow completes.
	 *
	 * @remarks
	 * Call when the exchange finishes; applies to PUBACK, PUBREC, and PUBCOMP paths as appropriate.
	 *
	 * @param client - Client socket.
	 * @param id - Packet identifier to release.
	 */
	public deletePacketIdentifier(client: TClient, id: number) {
		this.clientMap.get(client)?.packetIdentifier.delete(id);
	}

	/**
	 * @param client - Client socket.
	 * @param id - Packet identifier to test.
	 * @returns Whether that id is still tracked for the client.
	 */
	public hasPacketIdentifier(client: TClient, id: number) {
		return this.clientMap.get(client)?.packetIdentifier.has(id);
	}

	/**
	 * Drops all tracked packet identifiers for a client (e.g. on disconnect).
	 *
	 * @param client - Client socket.
	 */
	public clearPacketIdentifier(client: TClient) {
		this.clientMap.get(client)?.packetIdentifier.clear();
	}
}

/**
 * Abstract base for MQTT session/subscription/publish backends (memory, Redis, etc.).
 *
 * @remarks
 * Subclasses implement connection state, subscriptions, retained messages, and may delegate packet-id storage to {@link ClientIdentifierManager}.
 * This class adds shared helpers for outbound packet identifiers and QoS 1/2 retry timers for pending PUBLISH/PUBREL.
 */
export abstract class Manager {
	abstract readonly clientIdentifierManager: ClientIdentifierManager;
	private qosRetryCount = 3;
	private readonly qosRetryIntervalMs = 5000;
	private readonly pendingRetryMap = new Map<TClient, Map<number, { packet: Buffer; type: 'publish' | 'pubrel'; attempts: number; timer?: NodeJS.Timeout }>>();

	/**
	 * Whether the client is connected (e.g. anywhere in the cluster vs. only this process — implementation-defined).
	 *
	 * @param key - Connected socket **or** client identifier string, depending on overload.
	 * @returns True if considered connected.
	 */
	abstract isConnected(key: TClient): Promise<boolean>;
	/**
	 * @param key - Client identifier string.
	 * @returns True if considered connected.
	 */
	abstract isConnected(key: TIdentifier): Promise<boolean>;

	/**
	 * Establishes or restores a session for an incoming connection.
	 *
	 * @param clientIdentifier - MQTT client id.
	 * @param connData - CONNECT payload-derived session options.
	 * @param client - TCP socket for this session.
	 */
	abstract connect(clientIdentifier: string, connData: IConnectData, client: TClient): Promise<void>;

	/**
	 * Gracefully closes the socket for a client id or the given socket.
	 *
	 * @param clientIdentifier - Client id string, or the socket to end.
	 */
	public disconnect(clientIdentifier: string | TClient): void {
		typeof clientIdentifier === 'string' ? this.clientIdentifierManager.getIdentifier(clientIdentifier)?.end() : clientIdentifier.end();
	}

	/**
	 * Clears session state for a disconnect: closes transport and applies session expiry policy per `sessionExpiryInterval`.
	 *
	 * @param clientIdentifier - Socket or client id.
	 */
	abstract clearConnect(clientIdentifier: TClient | TIdentifier): void;

	/**
	 * @param clientIdentifier - MQTT client id.
	 * @returns Whether a non-expired session exists for this client.
	 */
	abstract hasSession(clientIdentifier: string): Promise<boolean>;

	/**
	 * Removes all subscription state for a client.
	 *
	 * @param clientIdentifier - Subscriber client id.
	 */
	abstract clearSubscribe(clientIdentifier: string): Promise<void>;

	/**
	 * Adds or updates a topic subscription for a client.
	 *
	 * @param clientIdentifier - Subscriber client id.
	 * @param topic - Topic filter or name.
	 * @param data - QoS and MQTT 5 subscription options.
	 */
	abstract subscribe(clientIdentifier: string, topic: TTopic, data: TSubscribeData): Promise<void>;

	/**
	 * Removes a topic subscription for a client.
	 *
	 * @param clientIdentifier - Subscriber client id.
	 * @param topic - Topic to unsubscribe.
	 */
	abstract unsubscribe(clientIdentifier: string, topic: TTopic): Promise<void>;

	/**
	 * @param clientIdentifier - Client id.
	 * @param topic - Topic to check.
	 * @returns Whether the client is subscribed to that topic.
	 */
	abstract isSubscribe(clientIdentifier: string, topic: TTopic): Promise<boolean>;

	/**
	 * @param clientIdentifier - Client id.
	 * @param topic - Topic or filter.
	 * @returns Subscription metadata, if any.
	 */
	abstract getSubscription(clientIdentifier: TIdentifier, topic: string): Promise<TSubscribeData | undefined>;

	/**
	 * Publishes a message to matching subscribers (implementation handles fan-out and QoS).
	 *
	 * @param clientIdentifier - Publishing client id (source).
	 * @param topic - Publish topic.
	 * @param pubData - Payload and MQTT 5 publish properties.
	 */
	abstract publish(clientIdentifier: string, topic: TTopic, pubData: IPublishData): void;

	/**
	 * Records client activity for keep-alive / session liveness.
	 *
	 * @param clientIdentifier - Client id.
	 */
	abstract ping(clientIdentifier: string): Promise<void>;

	/**
	 * @param client - Client socket.
	 * @returns Iterator of packet ids in use for that socket, or `undefined`.
	 */
	public getPacketIdentifierValues(client: TClient) {
		return this.clientIdentifierManager.getPacketIdentifierValues(client);
	}

	/**
	 * Allocates a new outbound packet identifier via {@link ClientIdentifierManager}.
	 *
	 * @remarks
	 * Used when the server sends PUBLISH to the client.
	 *
	 * @param client - Target socket.
	 * @returns New packet id, or `0` if unregistered.
	 */
	public newPacketIdentifier(client: TClient) {
		return this.clientIdentifierManager.newPacketIdentifier(client);
	}

	/**
	 * Sets how many QoS retry rounds to attempt before failing the client.
	 *
	 * @param count - Non-negative integer; invalid values are ignored.
	 */
	public setQoSRetryCount(count?: number) {
		if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
			this.qosRetryCount = Math.floor(count);
		}
	}

	/**
	 * Lazily creates the per-client map of pending QoS retry entries.
	 *
	 * @param client - Client socket.
	 * @returns Pending id → retry state map for that client.
	 */
	private getPendingMap(client: TClient) {
		let map = this.pendingRetryMap.get(client);
		if (!map) {
			map = new Map();
			this.pendingRetryMap.set(client, map);
		}
		return map;
	}

	/**
	 * Registers a copied packet for QoS retry until acked; schedules the first retry.
	 *
	 * @param client - Client socket.
	 * @param id - Packet identifier.
	 * @param packet - Raw PUBLISH or PUBREL bytes.
	 * @param type - Whether this is a publish or pubrel retry.
	 */
	public registerPendingPacket(client: TClient, id: number, packet: Buffer, type: 'publish' | 'pubrel' = 'publish') {
		const map = this.getPendingMap(client);
		const old = map.get(id);
		if (old?.timer) {
			clearTimeout(old.timer);
		}
		const entry = { packet: Buffer.from(packet), type, attempts: 0, timer: undefined as NodeJS.Timeout | undefined };
		map.set(id, entry);
		this.scheduleRetry(client, id);
	}

	/**
	 * Replaces a pending PUBLISH entry with a PUBREL retry for the same packet id.
	 *
	 * @param client - Client socket.
	 * @param id - Packet identifier.
	 * @param packet - PUBREL buffer.
	 */
	public promotePendingToPubRel(client: TClient, id: number, packet: Buffer) {
		this.registerPendingPacket(client, id, packet, 'pubrel');
	}

	/**
	 * Cancels retry for one packet id and clears the client entry if empty.
	 *
	 * @param client - Client socket.
	 * @param id - Packet identifier.
	 */
	public clearPendingPacket(client: TClient, id: number) {
		const map = this.pendingRetryMap.get(client);
		const pending = map?.get(id);
		if (pending?.timer) {
			clearTimeout(pending.timer);
		}
		map?.delete(id);
		if (map && map.size === 0) {
			this.pendingRetryMap.delete(client);
		}
	}

	/**
	 * Clears all pending QoS retries and timers for a client.
	 *
	 * @param client - Client socket.
	 */
	public clearPendingClient(client: TClient) {
		const map = this.pendingRetryMap.get(client);
		if (!map) return;
		for (const pending of map.values()) {
			if (pending.timer) {
				clearTimeout(pending.timer);
			}
		}
		this.pendingRetryMap.delete(client);
	}

	/**
	 * Schedules or reschedules a timed retry: resends with DUP on PUBLISH when applicable, or ends the client after max attempts.
	 *
	 * @param client - Client socket.
	 * @param id - Packet identifier.
	 */
	private scheduleRetry(client: TClient, id: number) {
		const map = this.pendingRetryMap.get(client);
		const pending = map?.get(id);
		if (!pending) return;
		pending.timer = setTimeout(() => {
			const current = this.pendingRetryMap.get(client)?.get(id);
			if (!current) return;
			if (current.attempts >= this.qosRetryCount) {
				this.clearPendingPacket(client, id);
				this.deletePacketIdentifier(client, id);
				client.end();
				return;
			}
			current.attempts += 1;
			const retryPacket = Buffer.from(current.packet);
			if (current.type === 'publish' && retryPacket[0] >> 4 === PacketType.PUBLISH) {
				retryPacket[0] = retryPacket[0] | 0x08;
			}
			client.write(retryPacket);
			this.scheduleRetry(client, id);
		}, this.qosRetryIntervalMs);
	}

	/**
	 * Releases the packet identifier and clears any pending QoS retry for it.
	 *
	 * @remarks
	 * Invoke when the publish exchange completes (PUBACK / PUBREC / PUBCOMP handling).
	 *
	 * @param client - Client socket.
	 * @param id - Packet identifier to release.
	 */
	public deletePacketIdentifier(client: TClient, id: number) {
		this.clientIdentifierManager.deletePacketIdentifier(client, id);
		this.clearPendingPacket(client, id);
	}

	/**
	 * @param client - Client socket.
	 * @param id - Packet identifier.
	 * @returns Whether the id is still tracked in {@link ClientIdentifierManager}.
	 */
	public hasPacketIdentifier(client: TClient, id: number) {
		return this.clientIdentifierManager.hasPacketIdentifier(client, id);
	}

	/**
	 * Clears all tracked packet identifiers for a client in {@link ClientIdentifierManager}.
	 *
	 * @param client - Client socket.
	 */
	public clearPacketIdentifier(client: TClient) {
		this.clientIdentifierManager.clearPacketIdentifier(client);
	}

	/** Retained message store: add or replace retained message for a topic (optional TTL). */
	abstract addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number): Promise<void>;

	/** Removes the retained message for a topic, if any. */
	abstract deleteRetainMessage(topic: string): Promise<void>;

	/** @returns Retained payload for the topic, if present. */
	abstract getRetainMessage(topic: string): Promise<IPublishData | undefined>;

	/**
	 * Iterates retained messages, optionally scoped to one topic prefix/filter.
	 *
	 * @param callbackfn - Async handler per topic.
	 * @param topic - If set, restricts iteration (implementation-defined).
	 */
	abstract forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => Promise<void>, topic?: string): Promise<void>;

	/**
	 * Releases backend resources (default: no-op; override in concrete managers).
	 */
	public async dispose(): Promise<void> {
		// default no-op
	}
}
