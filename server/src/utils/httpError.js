/** Error carrying an HTTP status and a message that is safe to show clients. */
export function httpError(status, publicMessage, extra = {}) {
  const e = new Error(publicMessage);
  e.status = status;
  e.publicMessage = publicMessage;
  Object.assign(e, extra);
  return e;
}
