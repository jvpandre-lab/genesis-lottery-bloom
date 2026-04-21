import fs from "fs";
import path from "path";
import { generate, GenerateInput } from "../engine/generatorCore";
import { mulberry32 } from "../engine/rng";
import { DrawRecord, Dezena } from "../engine/lotteryTypes";

// Converter de array de strings para Dezena[] ordenado
function parseDezenas(rawDezenas: string[]): Dezena[] {
    return rawDezenas.map(d => parseInt(d, 10) as Dezena).sort((a, b) => a - b);
}

// Retorna acertos entre o jogo e o sorteio real
function countHits(game: Dezena[], real: Dezena[]): number {
    let hits = 0;
    const set = new Set(real);
    for (const n of game) {
        if (set.has(n)) hits++;
    }
    return hits;
}

interface RunStats {
    hits15: number;
    hits16: number;
    hits17: number;
    hits18: number;
    hits19: number;
    hits20: number;
    zeroHits: number;
    poorGames: number; // < 10 acertos
    totalHits: number;
    totalGames: number;
    lineagePerformances: Record<string, { totalHits: number, count: number }>;
    scenarioPerformances: Record<string, { totalHits: number, count: number }>;
}

function initStats(): RunStats {
    return {
        hits15: 0, hits16: 0, hits17: 0, hits18: 0, hits19: 0, hits20: 0, zeroHits: 0, poorGames: 0,
        totalHits: 0, totalGames: 0,
        lineagePerformances: {}, scenarioPerformances: {}
    };
}

function updateStats(stats: RunStats, game: any, real: Dezena[]) {
    const hits = countHits(game.numbers, real);
    stats.totalHits += hits;
    stats.totalGames++;

    if (hits === 15) stats.hits15++;
    if (hits === 16) stats.hits16++;
    if (hits === 17) stats.hits17++;
    if (hits === 18) stats.hits18++;
    if (hits === 19) stats.hits19++;
    if (hits === 20) stats.hits20++;
    if (hits === 0) stats.zeroHits++;
    if (hits < 10) stats.poorGames++;

    const lin = game.lineage;
    if (!stats.lineagePerformances[lin]) stats.lineagePerformances[lin] = { totalHits: 0, count: 0 };
    stats.lineagePerformances[lin].totalHits += hits;
    stats.lineagePerformances[lin].count++;

    const sc = game.scenario || "hybrid"; // default se não tiver
    if (!stats.scenarioPerformances[sc]) stats.scenarioPerformances[sc] = { totalHits: 0, count: 0 };
    stats.scenarioPerformances[sc].totalHits += hits;
    stats.scenarioPerformances[sc].count++;
}

async function runBacktest(draws: any[], maxDrawsToTest: number, gamesPerDraw: number) {
    console.log(`\n=== INICIANDO BACKTEST: ÚLTIMOS ${maxDrawsToTest} CONCURSOS ===`);

    const statsA = initStats();
    const statsB = initStats();

    // O array da API vem do concurso mais recente pro mais antigo? Não, vem ascendente (1, 2, ... último)
    // Então os últimos maxDrawsToTest estão no final do array.
    const nDraws = draws.length;
    const startIdx = Math.max(0, nDraws - maxDrawsToTest);

    // history total de 1 até startIdx-1 será usado como base
    // A cada sorteio, atualizamos o history
    let historyDraws: DrawRecord[] = draws.slice(0, startIdx).map(d => ({
        contestNumber: d.concurso,
        drawDate: d.data,
        numbers: parseDezenas(d.dezenas)
    }));

    let recentResults: any[] = [];

    const startTime = Date.now();

    for (let i = startIdx; i < nDraws; i++) {
        const currentReal = parseDezenas(draws[i].dezenas);
        const contest = draws[i].concurso;
        console.log(`\n-- Simulando Concurso ${contest} (Faltam ${nDraws - i})`);

        // Semente fixa por concurso para garantir comparação justa (Modo A e Modo B partem do mesmo estado estocástico)
        const seedA = contest * 10;
        const seedB = contest * 10;

        // Modo A: Sem os novos motores (simulando a versão antiga reativa e sem poda inteligente)
        const inputA: GenerateInput = {
            count: gamesPerDraw,
            scenario: "hybrid", // cenário base estático
            recentDraws: historyDraws.slice(-10), // Apenas passamos draws por cima, ecossistema desativado
            recentResults: [],
            rng: mulberry32(seedA),
            twoBrains: false, // fallback genético simples (antes do arbiter v2)
            disableEngines: {
                preGenEcosystem: true, // Sem leitura pré-geração
                diversity: true,       // Sem poda de redundância pré-árbitro
                coverage: true,        // Sem rejeição de degenerados
                batchObjective: true,  // Sem função objetivo balanceada
            }
        };

        // Modo B: Arquitetura nova, todos os motores ativos, ecossistema puxando history
        const inputB: GenerateInput = {
            count: gamesPerDraw,
            scenario: "hybrid",
            recentDraws: historyDraws.slice(-15),
            recentResults: recentResults, // O ecossistema agora evolui!
            rng: mulberry32(seedB),
            twoBrains: true,
            disableEngines: {}
        };

        const resA = await generate(inputA);
        const resB = await generate(inputB);

        // Salva result B para alimentar o ecossistema e drift da próxima geração
        recentResults = [...recentResults, resB].slice(-5);

        // Avaliar jogos e incrementar stats
        const gamesA = resA.batches.flatMap(b => b.games);
        for (const g of gamesA) updateStats(statsA, g, currentReal);

        const gamesB = resB.batches.flatMap(b => b.games);
        for (const g of gamesB) {
            // associar o scenario real usado no B (pode ter sido sobreposto pelo ecossistema)
            updateStats(statsB, { ...g, scenario: resB.scenario }, currentReal);
        }

        // update history
        historyDraws.push({
            contestNumber: contest,
            drawDate: draws[i].data,
            numbers: currentReal
        });
    }

    const elap = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== RESULTADOS: ÚLTIMOS ${maxDrawsToTest} CONCURSOS (${elap}s) ===`);

    const reportStr = `=== RESULTADOS: ÚLTIMOS ${maxDrawsToTest} CONCURSOS (${elap}s) ===
[MODO A (Antigão v1)]  - Jogos: ${statsA.totalGames} | Média Acertos: ${(statsA.totalHits / Math.max(1, statsA.totalGames)).toFixed(3)}
 -> 15 Acertos: ${statsA.hits15}
 -> 16 Acertos: ${statsA.hits16}
 -> 17 Acertos: ${statsA.hits17}
 -> 18 Acertos: ${statsA.hits18}
 -> 19 Acertos: ${statsA.hits19}
 -> 20 Acertos: ${statsA.hits20}
 -> 0 Acertos : ${statsA.zeroHits}
 -> Jogos < 10: ${statsA.poorGames} (lixo)

[MODO B (Motores v2)]  - Jogos: ${statsB.totalGames} | Média Acertos: ${(statsB.totalHits / Math.max(1, statsB.totalGames)).toFixed(3)}
 -> 15 Acertos: ${statsB.hits15}
 -> 16 Acertos: ${statsB.hits16}
 -> 17 Acertos: ${statsB.hits17}
 -> 18 Acertos: ${statsB.hits18}
 -> 19 Acertos: ${statsB.hits19}
 -> 20 Acertos: ${statsB.hits20}
 -> 0 Acertos : ${statsB.zeroHits}
 -> Jogos < 10: ${statsB.poorGames} (lixo)
`;

    console.log(reportStr);
    fs.writeFileSync("backtest_results.json", JSON.stringify({ A: statsA, B: statsB, reportStr }, null, 2));

    const printStats = (name: string, st: RunStats) => {
        const avgHits = (st.totalHits / Math.max(1, st.totalGames)).toFixed(3);
        const varHits = "N/A"; // simplificado para output, vamos focar nos prêmios
        console.log(`\n[${name}]  - Jogos: ${st.totalGames} | Média Acertos: ${avgHits}`);
        console.log(` -> 15 Acertos: ${st.hits15}`);
        console.log(` -> 16 Acertos: ${st.hits16}`);
        console.log(` -> 17 Acertos: ${st.hits17}`);
        console.log(` -> 18 Acertos: ${st.hits18}`);
        console.log(` -> 19 Acertos: ${st.hits19}`);
        console.log(` -> 20 Acertos: ${st.hits20}`);
        console.log(` -> 0 Acertos : ${st.zeroHits}`);
        console.log(` -> Jogos < 10: ${st.poorGames} (lixo)`);
        console.log(` -> Avaliação de Linhagens:`);
        Object.keys(st.lineagePerformances).forEach(lin => {
            const perf = st.lineagePerformances[lin];
            console.log(`    - ${lin}: ${(perf.totalHits / perf.count).toFixed(3)} avg (${perf.count} picks)`);
        });
    };

    printStats("MODO A (Antigão v1)", statsA);
    printStats("MODO B (Motores v2)", statsB);
}

async function main() {
    console.log("Baixando dados reais da API da Caixa (heroku proxy)...");
    try {
        const response = await fetch("https://loteriascaixa-api.herokuapp.com/api/lotomania");
        const draws = await response.json();
        console.log(`Download completo: ${draws.length} concursos obtidos.`);

        // rodar backtests paralelos pros periodos. Vamos rodar sequencial por conta da memoria.
        // Usaremos volume de 6 jogos por concurso
        await runBacktest(draws, 50, 6);
    } catch (e) {
        console.error("Erro na execucao", e);
    }
}

describe("Backtest Real Data", () => {
    it("runs backtest against the last 50 draws", async () => {
        await main();
    }, 600000);
});
