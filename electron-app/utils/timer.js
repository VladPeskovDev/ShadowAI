class Timer {
  constructor(label) {
    this.label = label;
    this.startTime = Date.now();
    console.log(`⏱️  [${this.label}] СТАРТ`);
  }

  mark(checkpoint) {
    const elapsed = Date.now() - this.startTime;
    console.log(`⏱️  [${this.label}] ${checkpoint}: ${elapsed}ms`);
    return elapsed;
  }

  end() {
    const total = Date.now() - this.startTime;
    console.log(`⏱️  [${this.label}] ЗАВЕРШЕНО: ${total}ms (${(total / 1000).toFixed(2)}s)`);
    return total;
  }
}

module.exports = { Timer };