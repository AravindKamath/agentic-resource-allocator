import http from 'http';
import { config } from '../../config.js';

/**
 * Minimal stand-in for the FastAPI agent worker. `reply(body, status)` sets the
 * response for the next POST /triage call(s).
 */
export async function startAgentStub() {
  let next = { status: 200, body: {} };
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(next.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(next.body));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  config.agent.baseUrl = `http://127.0.0.1:${server.address().port}`;
  config.agent.retry = 0;
  return {
    reply(body, status = 200) { next = { status, body }; },
    close: () => new Promise(resolve => server.close(resolve))
  };
}
