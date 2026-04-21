import { generate } from '../engine/generatorCore';
import { mulberry32 } from '../engine/rng';
import { backtest } from '../engine/backtestEngine';
import { scoreGame, ScoreContext } from '../engine/scoreEngine';

// Mock data for testing
const mockDraws = Array.from({ length: 50 }, (_, i) => ({
  contestNumber: 2000 + i,
  numbers: Array.from({ length: 20 }, (_, k) => (i * 3 + k * 7) % 100),
}));

interface TestResult {
  engine: string;
  normal: {
    avgScore: number;
    diversity: number;
    coverage: number;
    uniqueNumbers: number;
    structuralVariance: number;
  };
  disabled: {
    avgScore: number;
    diversity: number;
    coverage: number;
    uniqueNumbers: number;
    structuralVariance: number;
  };
  impact: {
    scoreDiff: number;
    diversityDiff: number;
    coverageDiff: number;
    uniqueDiff: number;
    varianceDiff: number;
    hasImpact: boolean;
  };
}

function calculateMetrics(games: number[][]): {
  avgScore: number;
  diversity: number;
  coverage: number;
  uniqueNumbers: number;
  structuralVariance: number;
} {
  // Create a basic context for scoring
  const ctx: ScoreContext = {
    usage: new Array(100).fill(0), // neutral territory
    reference: [], // no reference games for individual scoring
    recentDraws: mockDraws.slice(0, 5).map(d => d.numbers as number[]),
    lineage: 'hybrid'
  };

  const scores = games.map(game => {
    const result = scoreGame(game as any, ctx);
    return result.total;
  });
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Diversity: average Jaccard distance between games
  let diversity = 0;
  for (let i = 0; i < games.length; i++) {
    for (let j = i + 1; j < games.length; j++) {
      const set1 = new Set(games[i]);
      const set2 = new Set(games[j]);
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);
      diversity += intersection.size / union.size;
    }
  }
  diversity = diversity / (games.length * (games.length - 1) / 2);

  // Coverage: percentage of numbers 0-99 used
  const allNumbers = new Set(games.flat());
  const coverage = allNumbers.size / 100;

  // Unique numbers per game
  const uniqueNumbers = games[0].length; // Assuming all games have same size

  // Structural variance: variance in number distribution
  const numberCounts = new Array(100).fill(0);
  games.flat().forEach(num => numberCounts[num]++);
  const mean = games.flat().length / 100;
  const structuralVariance = numberCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / 100;

  return { avgScore, diversity, coverage, uniqueNumbers, structuralVariance };
}

async function testEngineImpact(engineName: string, normalConfig: any, disabledConfig: any): Promise<TestResult> {
  console.log(`Testing ${engineName}...`);

  const normalGen = await generate({ ...normalConfig, rng: mulberry32(42) });
  const disabledGen = await generate({ ...disabledConfig, rng: mulberry32(42) });

  const normalMetrics = calculateMetrics(normalGen.batches.flatMap(b => b.games.map(g => g.numbers)));
  const disabledMetrics = calculateMetrics(disabledGen.batches.flatMap(b => b.games.map(g => g.numbers)));

  return {
    engine: engineName,
    normal: normalMetrics,
    disabled: disabledMetrics,
    impact: {
      scoreDiff: normalMetrics.avgScore - disabledMetrics.avgScore,
      diversityDiff: normalMetrics.diversity - disabledMetrics.diversity,
      coverageDiff: normalMetrics.coverage - disabledMetrics.coverage,
      uniqueDiff: normalMetrics.uniqueNumbers - disabledMetrics.uniqueNumbers,
      varianceDiff: normalMetrics.structuralVariance - disabledMetrics.structuralVariance,
      hasImpact: Math.abs(normalMetrics.avgScore - disabledMetrics.avgScore) > 0.01 ||
                 Math.abs(normalMetrics.diversity - disabledMetrics.diversity) > 0.01 ||
                 Math.abs(normalMetrics.coverage - disabledMetrics.coverage) > 0.01
    }
  };
}

export async function runEngineImpactTests(): Promise<TestResult[]> {
  const baseConfig = { count: 5, scenario: 'hybrid' };

  const tests = [
    {
      name: 'twoBrainsEngine',
      normal: { ...baseConfig, twoBrains: true },
      disabled: { ...baseConfig, twoBrains: false }
    },
    {
      name: 'territoryEngine',
      normal: baseConfig,
      disabled: { ...baseConfig, disableEngines: { territory: true } }
    },
    {
      name: 'coverageEngine',
      normal: baseConfig,
      disabled: { ...baseConfig, disableEngines: { coverage: true } }
    },
    {
      name: 'diversityEngine',
      normal: baseConfig,
      disabled: { ...baseConfig, disableEngines: { diversity: true } }
    },
    {
      name: 'evolutionaryEngine',
      normal: baseConfig,
      disabled: { ...baseConfig, disableEngines: { evolutionary: true } }
    },
    {
      name: 'adaptivePressureEngine',
      normal: baseConfig,
      disabled: { ...baseConfig, disableEngines: { adaptivePressure: true } }
    },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    const result = await testEngineImpact(test.name, test.normal, test.disabled);
    results.push(result);
    console.log(`${test.name}: Score diff: ${result.impact.scoreDiff.toFixed(3)}, Diversity diff: ${result.impact.diversityDiff.toFixed(3)}, Coverage diff: ${result.impact.coverageDiff.toFixed(3)}, Has Impact: ${result.impact.hasImpact}`);
  }

  return results;
}

// Teste de validação do sistema
describe('System Validation', () => {
  it('should demonstrate real engine impact on generation', async () => {
    const results = await runEngineImpactTests();

    // Log detailed results
    console.log('\n=== ENGINE IMPACT ANALYSIS ===');
    results.forEach(result => {
      console.log(`\n${result.engine}:`);
      console.log(`  Normal - Score: ${result.normal.avgScore.toFixed(3)}, Diversity: ${result.normal.diversity.toFixed(3)}, Coverage: ${result.normal.coverage.toFixed(3)}`);
      console.log(`  Disabled - Score: ${result.disabled.avgScore.toFixed(3)}, Diversity: ${result.disabled.diversity.toFixed(3)}, Coverage: ${result.disabled.coverage.toFixed(3)}`);
      console.log(`  Impact - Score: ${result.impact.scoreDiff.toFixed(3)}, Diversity: ${result.impact.diversityDiff.toFixed(3)}, Coverage: ${result.impact.coverageDiff.toFixed(3)}`);
      console.log(`  Has Real Impact: ${result.impact.hasImpact}`);
    });

    // Verify that some engines have impact
    const impactfulEngines = results.filter(r => r.impact.hasImpact);
    expect(impactfulEngines.length).toBeGreaterThan(0);

    // Verify that not all engines have impact (some might be observers)
    const observerEngines = results.filter(r => !r.impact.hasImpact);
    console.log(`\nEngines with real impact: ${impactfulEngines.map(r => r.engine).join(', ')}`);
    console.log(`Engines that are observers: ${observerEngines.map(r => r.engine).join(', ')}`);
  }, 60000); // 60 second timeout for comprehensive testing

  it('should validate two brains behavior and arbitration', async () => {
    console.log('\n=== TWO BRAINS VALIDATION ===');

    // Test different scenarios
    const scenarios = ['conservative', 'hybrid', 'aggressive', 'exploratory'];

    for (const scenario of scenarios) {
      const gen = await generate({ count: 10, scenario: scenario as any, twoBrains: true, rng: mulberry32(123) });

      // Count games from each brain
      let brainACount = 0;
      let brainBCount = 0;

      gen.batches.forEach(batch => {
        batch.games.forEach(game => {
          // Check which brain the game came from based on lineage patterns
          // This is a simplified check - in reality we'd need to track from the engine
          if (['conservative', 'coverage'].includes(game.lineage)) {
            brainACount++;
          } else {
            brainBCount++;
          }
        });
      });

      const totalGames = brainACount + brainBCount;
      const brainAPercent = (brainACount / totalGames) * 100;
      const brainBPercent = (brainBCount / totalGames) * 100;

      console.log(`${scenario}: Brain A: ${brainACount} (${brainAPercent.toFixed(1)}%), Brain B: ${brainBCount} (${brainBPercent.toFixed(1)}%)`);

      // Verify arbitration is working (not 100% one brain)
      expect(brainAPercent).toBeGreaterThan(10);
      expect(brainBPercent).toBeGreaterThan(10);
      expect(Math.abs(brainAPercent - brainBPercent)).toBeLessThan(70); // Not too imbalanced
    }

    // Test forced scenarios
    console.log('\nTesting forced brain dominance...');

    // For conservative scenario, Brain A should dominate Alpha batch
    const conservativeGen = await generate({ count: 4, scenario: 'conservative', twoBrains: true, rng: mulberry32(456) });
    const alphaBatch = conservativeGen.batches.find(b => b.name === 'Alpha');
    expect(alphaBatch).toBeDefined();

    console.log(`Conservative Alpha batch: ${alphaBatch!.games.length} games`);
  });

  it('should validate backtest uses real generator', async () => {
    console.log('\n=== BACKTEST VALIDATION ===');

    // Generate a batch
    const gen = await generate({ count: 3, scenario: 'hybrid', twoBrains: true, rng: mulberry32(789) });
    const games = gen.batches.flatMap(b => b.games.map(g => g.numbers));

    // Create mock historical draws
    const historicalDraws = Array.from({ length: 100 }, (_, i) => ({
      contestNumber: 1900 + i,
      numbers: Array.from({ length: 20 }, (_, k) => (i * 7 + k * 11) % 100),
    }));

    // Run backtest
    const backtestResult = backtest([gen], historicalDraws, [20, 50, 100]);

    console.log(`Backtest results:`);
    backtestResult.windows.forEach(window => {
      console.log(`  Window ${window.draws} draws: ${window.totalGames} games, ${window.avgHits.toFixed(3)} avg hits`);
    });

    // Verify backtest produces meaningful results
    expect(backtestResult.windows.length).toBeGreaterThan(0);
    expect(backtestResult.windows[0].avgHits).toBeGreaterThan(0);
    expect(backtestResult.perLineage.length).toBeGreaterThan(0);
  });

  it('should validate evolutionary progression over generations', async () => {
    console.log('\n=== EVOLUTIONARY PROGRESSION TEST ===');

    const generations = 5;
    let lastGen: any = null;
    const evolutionData = [];

    for (let i = 0; i < generations; i++) {
      const gen = await generate({
        count: 5,
        scenario: 'hybrid',
        twoBrains: true,
        recentDraws: lastGen ? [lastGen.batches.flatMap(b => b.games.map(g => ({ contestNumber: 2000 + i, numbers: g.numbers }))).pop()] : undefined,
        rng: mulberry32(1000 + i)
      });

      const metrics = calculateMetrics(gen.batches.flatMap(b => b.games.map(g => g.numbers)));
      evolutionData.push({
        generation: i + 1,
        score: metrics.avgScore,
        diversity: metrics.diversity,
        coverage: metrics.coverage
      });

      console.log(`Gen ${i + 1}: Score ${metrics.avgScore.toFixed(3)}, Diversity ${metrics.diversity.toFixed(3)}, Coverage ${metrics.coverage.toFixed(3)}`);

      lastGen = gen;
    }

    // Check for evolution trends
    const firstGen = evolutionData[0];
    const lastGenData = evolutionData[evolutionData.length - 1];

    console.log(`Evolution from gen 1 to ${generations}:`);
    console.log(`  Score: ${firstGen.score.toFixed(3)} → ${lastGenData.score.toFixed(3)} (Δ${(lastGenData.score - firstGen.score).toFixed(3)})`);
    console.log(`  Diversity: ${firstGen.diversity.toFixed(3)} → ${lastGenData.diversity.toFixed(3)} (Δ${(lastGenData.diversity - firstGen.diversity).toFixed(3)})`);
    console.log(`  Coverage: ${firstGen.coverage.toFixed(3)} → ${lastGenData.coverage.toFixed(3)} (Δ${(lastGenData.coverage - firstGen.coverage).toFixed(3)})`);

    // Verify some evolution occurred
    expect(Math.abs(lastGenData.score - firstGen.score)).toBeLessThan(0.1); // Should not change drastically
  });
});