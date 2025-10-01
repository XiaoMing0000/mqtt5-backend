import net from 'net';
import type { WebSocket, Data } from 'ws';

// Adapter: wrap a WebSocket (from 'ws') to provide a net.Socket-like object
// The adapter extends net.Socket so it can be used where a Socket is expected.
export class WebSocketAdapter extends net.Socket {
	private ws: WebSocket;
	private cacheBuffer: Buffer[] = [];
	private expectedLength: number | null = null;

	constructor(ws: WebSocket) {
		// initialize as an unconnected socket
		super();
		this.ws = ws;

		// try to copy remoteAddress if available from underlying socket
		try {
			// @ts-ignore
			const addr = (ws as any)?._socket?.remoteAddress;
			if (addr) {
				// net.Socket.remoteAddress is readonly in typings; assign on the instance as any
				(this as any).remoteAddress = addr;
			}
		} catch (_e) {
			// ignore
		}

		this.ws.on('message', (data: Data) => {
			const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data as Uint8Array);

			// 将数据包添加到缓存
			this.cacheBuffer.push(buf);
			const totalBuffer = Buffer.concat(this.cacheBuffer);

			// 如果还没有确定期望长度，尝试从第一个数据包解析
			if (this.expectedLength === null) {
				this.expectedLength = this.parseExpectedLength(totalBuffer);
			}

			// 如果已经达到期望长度，发送完整数据包
			if (this.expectedLength !== null && totalBuffer.length >= this.expectedLength) {
				const completePacket = totalBuffer.slice(0, this.expectedLength);
				this.emit('data', completePacket);

				// 重置缓存和期望长度
				this.cacheBuffer = [];
				const currentExpectedLength = this.expectedLength;
				this.expectedLength = null;

				// 如果还有剩余数据，递归处理
				if (totalBuffer.length > currentExpectedLength) {
					const remainingData = totalBuffer.slice(currentExpectedLength);
					this.handleRemainingData(remainingData);
				}
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
	 * 解析期望的数据包长度
	 * 这里需要根据你的协议格式来实现
	 * 例如：MQTT 协议中，第二个字节包含剩余长度信息
	 */
	private parseExpectedLength(buffer: Buffer): number | null {
		if (buffer.length < 2) {
			return null; // 数据不够，无法解析长度
		}

		// 示例：假设是 MQTT 协议，第二个字节开始是剩余长度
		// 这里需要根据你的实际协议格式来调整
		try {
			// MQTT 固定头部至少2字节：1字节控制标志 + 可变长度编码的剩余长度
			let multiplier = 1;
			let value = 0;
			let pos = 1; // 从第二个字节开始

			let encodedByte: number;
			do {
				if (pos >= buffer.length) {
					return null; // 数据不够
				}

				encodedByte = buffer[pos];
				value += (encodedByte & 127) * multiplier;
				multiplier *= 128;
				pos++;

				if (multiplier > 128 * 128 * 128) {
					return null; // 长度编码错误
				}
			} while ((encodedByte & 128) !== 0);

			// 总长度 = 固定头部长度 + 剩余长度
			const totalLength = pos + value;
			return totalLength;
		} catch (error) {
			return null;
		}
	}

	/**
	 * 处理剩余数据
	 */
	private handleRemainingData(remainingData: Buffer): void {
		// 将剩余数据作为新的数据包处理
		this.cacheBuffer.push(remainingData);
		const totalBuffer = Buffer.concat(this.cacheBuffer);

		if (this.expectedLength === null) {
			this.expectedLength = this.parseExpectedLength(totalBuffer);
		}

		if (this.expectedLength !== null && totalBuffer.length >= this.expectedLength) {
			const completePacket = totalBuffer.slice(0, this.expectedLength);
			this.emit('data', completePacket);

			this.cacheBuffer = [];
			const currentExpectedLength = this.expectedLength;
			this.expectedLength = null;

			if (totalBuffer.length > currentExpectedLength) {
				const newRemainingData = totalBuffer.slice(currentExpectedLength);
				this.handleRemainingData(newRemainingData);
			}
		}
	}

	// override write to send via WebSocket
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
			// @ts-ignore readyState
			if ((this.ws as any).readyState === 1) {
				// ws.send accepts Buffer
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
				} catch (_e) {}
				if (cb) cb();
			});
		} else {
			try {
				(this.ws as any).close();
			} catch (_e) {}
			if (cb) cb();
		}
		return this;
	}

	destroy(error?: Error): this {
		try {
			(this.ws as any).terminate();
		} catch (_e) {
			// ignore
		}
		return super.destroy(error);
	}
}

export default WebSocketAdapter;
