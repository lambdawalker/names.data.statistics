export type ErrorCode='invalid_input'|'invalid_response'|'too_large'|'aborted'|'timeout'|'network'|'http'|'rate_limited'|'unsupported'|'not_found'|'response_too_large'|'api_error';
export class SourceError extends Error {
 constructor(public readonly code:ErrorCode,message:string,public readonly status?:number,public readonly retryAfterMs?:number){super(message);this.name='SourceError';}
}
export function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw new SourceError('aborted','Operation cancelled');}
export function integer(value:string,min=0,max=Number.MAX_SAFE_INTEGER):number{if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw new SourceError('invalid_response','Invalid integer field');return Number(value);}
