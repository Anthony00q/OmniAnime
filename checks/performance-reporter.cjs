const fs = require('node:fs');
const path = require('node:path');

class PerformanceReporter {
  samples = [];
  performanceRun = false;
  onBegin(_config, suite) {
    this.performanceRun = suite.allTests().some((test) => test.parent.project()?.name === 'performance');
  }
  onTestEnd(_test, result) {
    const attachment = result.attachments.find((entry) => entry.name === 'rendimiento');
    if (result.status === 'passed' && attachment?.body) this.samples.push(JSON.parse(attachment.body.toString()));
  }
  onEnd(result) {
    if (!this.performanceRun) return;
    const sorted = this.samples.map((sample) => sample.startupMs).sort((a, b) => a - b);
    const output = path.resolve(__dirname, '../test-results/performance-summary.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          status: result.status,
          samples: this.samples,
          startupMedianMs: sorted[Math.floor(sorted.length / 2)],
          startupMinMs: sorted[0],
          startupMaxMs: sorted.at(-1),
          comparableOnlyOnSameEnvironment: true,
        },
        null,
        2,
      ),
    );
  }
}

module.exports = PerformanceReporter;
