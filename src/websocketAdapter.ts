import net from 'net';
import type { WebSocket, Data } from 'ws';
import { StreamFramer } from './parse';

/**
 * Adapts a `ws` {@link WebSocket} to a {@link net.Socket}-like interface for MQTT framing.
 * Extends {@link net.Socket} so callers expecting a TCP socket can use MQTT over WebSocket.
 */
export class WebSocketAdapter extends net.Socket {
	private ws: WebSocket;
	private framer = new StreamFramer();

	/**
	 * Creates an adapter that bridges WebSocket messages to `data` events as framed MQTT packets.
	 *
	 * @param ws - The underlying WebSocket connection.
	 */
	constructor(ws: WebSocket) {
		super();
		this.ws = ws;

		try {
			// @typescript-eslint/ban-ts-comment
			const addr = (ws as any)?._socket?.remoteAddress;
			if (addr) {
				(this as any).remoteAddress = addr;
			}
		} catch (_e) {
			this.emit('error', _e as Error);
		}

		this.ws.on('message', (data: Data) => {
			if (typeof data === 'string') {
				this.emit('error', new Error('MQTT over WebSocket requires binary frames.'));
				(this.ws as any).close();
				return;
			}
			const buf = Buffer.from(data as Uint8Array);

			try {
				const frames = this.framer.extractFrames(buf);
				for (const frame of frames) {
					this.emit('data', frame);
				}
			} catch (err) {
				this.emit('error', err as Error);
			}
		});

		this.ws.on('close', () => {
			this.emit('close');
			this.emit('end');
		});

		this.ws.on('error', (err: Error) => {
			this.emit('error', err);
		});
	}

	/**
	 * Sends bytes through the WebSocket when it is open.
	 *
	 * @param buffer - Payload as string or binary data.
	 * @param encodingOrCb - Optional encoding (if `buffer` is a string), or completion callback.
	 * @param cb - Optional callback invoked when the send completes or fails.
	 * @returns `true` if the frame was queued on an open socket; otherwise `false`.
	 */
	write(buffer: string | Uint8Array, encoding?: BufferEncoding, cb?: (err?: Error) => void): boolean;
	write(buffer: string | Uint8Array, cb?: (err?: Error) => void): boolean;
	write(buffer: string | Uint8Array, encodingOrCb?: BufferEncoding | ((err?: Error) => void), cb?: (err?: Error) => void): boolean {
		let encoding: BufferEncoding | undefined;
		let callback: ((err?: Error) => void) | undefined;

		if (typeof encodingOrCb === 'function') {
			callback = encodingOrCb;
		} else {
			encoding = encodingOrCb;
			callback = cb;
		}

		try {
			const data = typeof buffer === 'string' ? Buffer.from(buffer, encoding) : Buffer.from(buffer);
			if ((this.ws as any).readyState === 1) {
				(this.ws as any).send(data, (err: Error | undefined) => {
					if (callback) callback(err ?? undefined);
				});
				return true;
			}
		} catch (_e) {
			if (callback) callback(_e as Error);
		}
		return false;
	}

	/**
	 * Flushes optional final data, then closes the WebSocket.
	 *
	 * @param bufferOrCallback - Optional last chunk to send, or a callback when fully closed.
	 * @param encodingOrCallback - Encoding for a string buffer, or a no-arg callback.
	 * @param callback - Called after the socket is closed when no buffer is sent.
	 * @returns This instance for chaining.
	 */
	end(callback?: () => void): this;
	end(buffer: string | Uint8Array, callback?: () => void): this;
	end(buffer: string | Uint8Array, encoding?: BufferEncoding, callback?: () => void): this;
	end(bufferOrCallback?: string | Uint8Array | (() => void), encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void): this {
		let buffer: string | Uint8Array | undefined;
		let encoding: BufferEncoding | undefined;
		let cb: (() => void) | undefined;

		if (typeof bufferOrCallback === 'function') {
			cb = bufferOrCallback;
		} else {
			buffer = bufferOrCallback;
			if (typeof encodingOrCallback === 'function') {
				cb = encodingOrCallback;
			} else {
				encoding = encodingOrCallback;
				cb = callback;
			}
		}

		if (buffer) {
			this.write(buffer, encoding, () => {
				try {
					(this.ws as any).close();
				} catch (_e) {
					this.emit('error', _e as Error);
				}
				if (cb) cb();
			});
		} else {
			try {
				(this.ws as any).close();
			} catch (_e) {
				this.emit('error', _e as Error);
			}
			if (cb) cb();
		}
		return this;
	}

	/**
	 * Forcefully terminates the WebSocket, then invokes the base {@link net.Socket.destroy}.
	 *
	 * @param error - Optional error to associate with the destroyed socket.
	 * @returns This instance for chaining.
	 */
	destroy(error?: Error): this {
		try {
			(this.ws as any).terminate();
		} catch (_e) {
			this.emit('error', _e as Error);
		}
		return super.destroy(error);
	}
}

export default WebSocketAdapter;
