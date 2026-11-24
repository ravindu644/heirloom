// Starts heirloomd for the whole run. The function it returns is the teardown, which throws, and
// so fails the run, unless heirloomd shut down cleanly.
import { startServer } from '../server.ts';

// Not 8787: `make dev` may be running there, and e2e must never talk to a server it did not start.
export const ADDR = '127.0.0.1:8788';

export default async function () {
  const server = await startServer(ADDR);
  return () => server.stop();
}
