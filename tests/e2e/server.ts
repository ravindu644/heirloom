// Starts heirloomd for the whole run. The function it returns is the teardown, which throws, and
// so fails the run, unless heirloomd shut down cleanly.
import { remote, startServer } from '../server.ts';

// Not 8787: `make dev` may be running there, and e2e must never talk to a server it did not start.
export const ADDR = '127.0.0.1:8788';

/** The run's server, from inside a worker: globalSetup leaves its data directory in the environment. */
export const e2eServer = () => remote(`http://${ADDR}`, process.env.HEIRLOOM_E2E_DATA!);

export default async function () {
  const server = await startServer(ADDR);
  process.env.HEIRLOOM_E2E_DATA = server.data;
  return () => server.stop();
}
