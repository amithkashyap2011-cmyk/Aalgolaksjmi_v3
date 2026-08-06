/*
 * ─── Partition Report Exporter ─────────────────────────────
 *
 * Exports walk-forward comparative reports in Markdown & JSON.
 */

export class ReportExporter {
  public static generateMarkdownReport(metrics: any): string {
    return `# Institutional Walk-Forward Partition Report

## Data Partitioning Schedule
- **Training**: ${metrics.training.period}
- **Validation**: ${metrics.validation.period}
- **Walk Forward**: ${metrics.walkforward.period}
- **Paper Trading**: ${metrics.paper.period}

## Performance Matrix
| Metric | Training | Validation | Walk Forward | Paper Trading |
| :--- | :--- | :--- | :--- | :--- |
| **Win Rate** | ${metrics.training.winRate}% | ${metrics.validation.winRate}% | ${metrics.walkforward.winRate}% | ${metrics.paper.winRate}% |
| **Profit Factor** | ${metrics.training.profitFactor} | ${metrics.validation.profitFactor} | ${metrics.walkforward.profitFactor} | ${metrics.paper.profitFactor} |
| **Sharpe Ratio** | ${metrics.training.sharpeRatio} | ${metrics.validation.sharpeRatio} | ${metrics.walkforward.sharpeRatio} | ${metrics.paper.sharpeRatio} |
| **Sortino Ratio** | ${metrics.training.sortinoRatio} | ${metrics.validation.sortinoRatio} | ${metrics.walkforward.sortinoRatio} | ${metrics.paper.sortinoRatio} |
| **Max Drawdown** | ${metrics.training.maxDrawdownPct}% | ${metrics.validation.maxDrawdownPct}% | ${metrics.walkforward.maxDrawdownPct}% | ${metrics.paper.maxDrawdownPct}% |
| **Brier Score** | ${metrics.training.brierScore} | ${metrics.validation.brierScore} | ${metrics.walkforward.brierScore} | ${metrics.paper.brierScore} |
| **Expectancy** | +${metrics.training.expectancyR} R | +${metrics.validation.expectancyR} R | +${metrics.walkforward.expectancyR} R | +${metrics.paper.expectancyR} R |
`;
  }
}
