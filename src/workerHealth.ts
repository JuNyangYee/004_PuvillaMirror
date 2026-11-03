/** Judge executed work, not camera delivery rate or deliberate skipping. */
export class WorkerInferenceHealth {
  private startedAt = 0;
  private durations: number[] = [];

  reset(now: number): void {
    this.startedAt = now;
    this.durations = [];
  }

  /** Successful worker computation time; queue/delivery delay is excluded. */
  observe(milliseconds: number, now: number): boolean {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return false;
    this.durations.push(milliseconds);
    if (this.durations.length > 16) this.durations.shift();
    if (now - this.startedAt < 3000 || this.durations.length < 8) return false;
    // A few expensive recovery passes do not make the whole worker unhealthy.
    const slow = this.durations.filter(ms => ms > 125).length;
    return slow >= Math.ceil(this.durations.length * 0.75);
  }
}
