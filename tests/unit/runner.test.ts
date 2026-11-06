import { createTierRunner, TierStatus, type TierReply, type TierRunner, type WorkerLike } from '../../src';

const DEADLINE_MS = 1000;
const OTHER_ID = 99;

interface Req {
  prompt: string;
}

class FakeWorker extends EventTarget implements WorkerLike {
  posted: unknown[] = [];
  terminations = 0;
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminations += 1;
  }
  reply(data: TierReply<string>): void {
    const event = new Event('message') as Event & { data: TierReply<string> };
    event.data = data;
    this.dispatchEvent(event);
  }
}

function setup(): { fake: FakeWorker; made: () => number; runner: TierRunner<Req, string> } {
  const fake = new FakeWorker();
  let count = 0;
  const runner = createTierRunner<Req, string>(() => {
    count += 1;
    return fake;
  }, DEADLINE_MS);
  return { fake, made: () => count, runner };
}

async function isSettled(p: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void p.then(() => (settled = true));
  await new Promise((r) => setTimeout(r, 0));
  return settled;
}

afterEach(() => {
  jest.useRealTimers();
});

describe('createTierRunner', () => {
  it('with a done reply carrying a result, resolves with it', async () => {
    const { fake, runner } = setup();
    const pending = runner.run({ prompt: 'a' });

    fake.reply({ kind: 'done', id: 1, ms: 1, result: 'config' });

    expect(await pending).toBe('config');
  });

  it('with a request, posts it with its id', () => {
    const { fake, runner } = setup();

    void runner.run({ prompt: 'a' });

    expect(fake.posted).toEqual([{ id: 1, prompt: 'a' }]);
  });

  it('with a done reply that carries an error, resolves failed', async () => {
    const { fake, runner } = setup();
    const pending = runner.run({ prompt: 'a' });

    fake.reply({ kind: 'done', id: 1, ms: 1, error: 'boom' });

    expect(await pending).toBe(TierStatus.Failed);
  });

  it('with a worker error event, fails the request and terminates the worker', async () => {
    const { fake, runner } = setup();
    const pending = runner.run({ prompt: 'a' });

    fake.dispatchEvent(new Event('error'));

    expect([await pending, fake.terminations]).toEqual([TierStatus.Failed, 1]);
  });

  it('with a progress reply, keeps the request waiting', async () => {
    const { fake, runner } = setup();
    const pending = runner.run({ prompt: 'a' });

    fake.reply({ kind: 'progress', tier: 'embed', file: 'model.gguf', totalBytes: 1 });

    expect(await isSettled(pending)).toBe(false);
  });

  it('with a done reply for another request id, keeps this request waiting', async () => {
    const { fake, runner } = setup();
    const pending = runner.run({ prompt: 'a' });

    fake.reply({ kind: 'done', id: OTHER_ID, ms: 1, result: 'x' });

    expect(await isSettled(pending)).toBe(false);
  });

  it('past the deadline, resolves timed out and terminates the worker', async () => {
    jest.useFakeTimers();
    const { fake, runner } = setup();
    const pending = runner.run({ prompt: 'a' });

    jest.advanceTimersByTime(DEADLINE_MS);

    expect([await pending, fake.terminations]).toEqual([TierStatus.TimedOut, 1]);
  });

  it('after a timeout, the next run starts a new worker', async () => {
    jest.useFakeTimers();
    const { made, runner } = setup();
    const first = runner.run({ prompt: 'a' });
    jest.advanceTimersByTime(DEADLINE_MS);
    await first;

    void runner.run({ prompt: 'b' });

    expect(made()).toBe(2);
  });
});
