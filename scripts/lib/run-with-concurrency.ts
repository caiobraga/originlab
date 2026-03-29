/**
 * Executa tarefas assíncronas com no máximo `limit` em voo (sem threads — só concorrência I/O).
 */
export async function runWithConcurrency(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  const lim = Math.max(1, limit);
  if (tasks.length === 0) return;

  const executing = new Set<Promise<void>>();
  for (const task of tasks) {
    const p = (async () => {
      await task();
    })();
    executing.add(p);
    void p.finally(() => executing.delete(p));
    if (executing.size >= lim) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}
