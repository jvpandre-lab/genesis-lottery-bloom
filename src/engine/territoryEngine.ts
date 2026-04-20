import { Dezena, DOMAIN_SIZE, Game } from "./lotteryTypes";

/**
 * Territory Engine — mapa interno do espaço 00..99.
 * Mantém contagem de uso de cada dezena por linhagem/lote ao longo de gerações,
 * permitindo evitar saturação e incentivar exploração de zonas pouco usadas.
 */
export class TerritoryMap {
  // Quantas vezes cada dezena foi usada
  private usage: number[] = new Array(DOMAIN_SIZE).fill(0);
  private gamesObserved = 0;

  reset() {
    this.usage = new Array(DOMAIN_SIZE).fill(0);
    this.gamesObserved = 0;
  }

  observeGame(g: Pick<Game, "numbers">) {
    for (const n of g.numbers) this.usage[n]++;
    this.gamesObserved++;
  }

  observeNumbers(nums: Dezena[]) {
    for (const n of nums) this.usage[n]++;
    this.gamesObserved++;
  }

  /** densidade esperada por dezena considerando jogos observados (50/100). */
  expectedDensity(): number {
    return this.gamesObserved * 0.5; // 50/100 = 0.5
  }

  /** Pesos de exploração: dezenas pouco usadas recebem peso maior (>1). */
  explorationWeights(strength = 1): number[] {
    const expected = this.expectedDensity() || 1;
    return this.usage.map((u) => {
      const ratio = (u + 0.5) / (expected + 0.5);
      // ratio < 1 → sub-exploradas → peso maior. inverse weighted.
      return Math.pow(1 / ratio, strength);
    });
  }

  /** Pesos de saturação: dezenas muito usadas recebem peso menor. */
  saturationPenalty(): number[] {
    const expected = this.expectedDensity() || 1;
    return this.usage.map((u) => Math.max(0.001, 1 - (u - expected) / (expected * 2 + 1)));
  }

  usageSnapshot(): number[] {
    return this.usage.slice();
  }

  /** Entropia normalizada do uso (0=concentrado, 1=uniforme). */
  entropy(): number {
    const total = this.usage.reduce((s, v) => s + v, 0);
    if (total === 0) return 1;
    let h = 0;
    for (const u of this.usage) {
      if (u === 0) continue;
      const p = u / total;
      h -= p * Math.log(p);
    }
    return h / Math.log(DOMAIN_SIZE);
  }

  /** Identifica zonas (faixas de 10) com menor cobertura. */
  underexploredDecades(): number[] {
    const dec = new Array(10).fill(0);
    for (let i = 0; i < DOMAIN_SIZE; i++) dec[Math.floor(i / 10)] += this.usage[i];
    const avg = dec.reduce((s, v) => s + v, 0) / 10;
    const result: number[] = [];
    dec.forEach((v, i) => { if (v < avg * 0.9) result.push(i); });
    return result;
  }
}

export const globalTerritory = new TerritoryMap();
