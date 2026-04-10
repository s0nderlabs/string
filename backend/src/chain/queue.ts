type TxTask<T> = () => Promise<T>;

class TxQueue {
  private chain: Promise<void> = Promise.resolve();

  enqueue<T>(task: TxTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.chain = this.chain
        .then(() => task())
        .then(resolve, reject)
        .catch(() => {}); // Always recover the chain so subsequent tasks aren't blocked
    });
  }

  get pending(): Promise<void> {
    return this.chain;
  }
}

let _queue: TxQueue | null = null;

export function getTxQueue(): TxQueue {
  if (!_queue) _queue = new TxQueue();
  return _queue;
}
