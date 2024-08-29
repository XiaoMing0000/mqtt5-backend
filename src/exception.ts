export class PropertyException extends Error {
	protected code?: number;
	protected msg: string;
	constructor(msg: string, code?: number) {
		super();
		this.code = code;
		this.msg = msg;
	}
}
