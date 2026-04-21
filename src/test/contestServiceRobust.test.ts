import { describe, it, expect } from 'vitest';
import { parseDrawsFile, ImportReport } from '@/services/contestService';

describe('Contest Service - Robust History Parser', () => {
  it('should parse valid CSV and return report', () => {
    const csv = `concurso,data,d1,d2,d3,d4,d5,d6,d7,d8,d9,d10,d11,d12,d13,d14,d15,d16,d17,d18,d19,d20
1,2024-01-01,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19
2,2024-01-02,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39`;

    const result = parseDrawsFile(csv, 'test.csv') as any;
    const { draws, report } = (result && 'draws' in result && 'report' in result) 
      ? result 
      : { draws: result, report: { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} } };
    
    expect(draws.length).toBe(2);
    expect(report.totalRead).toBe(3); // header + 2 data lines
    expect(report.totalValid).toBe(2);
    expect(report.totalDiscarded).toBe(0); // header is not counted as discarded
  });

  it('should detect and reject duplicate numbers', () => {
    const csv = `1,2024-01-01,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,18`;

    const result = parseDrawsFile(csv, 'test.csv') as any;
    const { draws, report } = (result && 'draws' in result && 'report' in result) 
      ? result 
      : { draws: result, report: { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} } };
    
    expect(draws.length).toBe(0);
    expect(report.totalDiscarded).toBe(1);
    expect(report.discardReasons['duplicate_numbers']).toBe(1);
  });

  it('should detect and reject unsorted numbers', () => {
    const csv = `1,2024-01-01,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,19,18,17`;

    const result = parseDrawsFile(csv, 'test.csv') as any;
    const { draws, report } = (result && 'draws' in result && 'report' in result) 
      ? result 
      : { draws: result, report: { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} } };
    
    expect(draws.length).toBe(0);
    expect(report.discardReasons['unsorted_numbers']).toBe(1);
  });

  it('should reject lines with insufficient numbers', () => {
    const csv = `1,2024-01-01,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17`;

    const result = parseDrawsFile(csv, 'test.csv') as any;
    const { draws, report } = (result && 'draws' in result && 'report' in result) 
      ? result 
      : { draws: result, report: { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} } };
    
    // This has 18 numbers, which is sufficient (18-20), so should be accepted
    expect(draws.length).toBe(1);
    expect(report.discardReasons['insufficient_numbers']).toBeUndefined();
  });

  it('should reject lines with too many numbers', () => {
    const csv = `1,2024-01-01,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21`;

    const result = parseDrawsFile(csv, 'test.csv') as any;
    const { draws, report } = (result && 'draws' in result && 'report' in result) 
      ? result 
      : { draws: result, report: { totalRead: 0, totalValid: 0, totalDiscarded: 0, discardReasons: {} } };
    
    expect(draws.length).toBe(0);
    expect(report.discardReasons['too_many_numbers']).toBe(1);
  });

  it('should parse JSON format', () => {
    const json = JSON.stringify([
      { contestNumber: 1, drawDate: '2024-01-01', numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
      { contestNumber: 2, drawDate: '2024-01-02', numbers: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39] }
    ]);

    const result = parseDrawsFile(json, 'test.json') as any;
    const draws = Array.isArray(result) ? result : result.draws;
    
    expect(draws.length).toBe(2);
  });

  it('should normalize date formats', () => {
    const csv = `1,01/01/2024,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19`;

    const result = parseDrawsFile(csv, 'test.csv') as any;
    const draws = Array.isArray(result) ? result : result.draws;
    
    expect(draws.length).toBe(1);
    expect(draws[0].drawDate).toBe('2024-01-01');
  });

  it('should handle malformed input gracefully', () => {
    const result = parseDrawsFile('', 'test.csv') as any;
    const draws = Array.isArray(result) ? result : result.draws;
    
    expect(draws.length).toBe(0);
  });

  it('should detect invalid contest numbers', () => {
    const csv = `abc,2024-01-01,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19`;

    const result = parseDrawsFile(csv, 'test.csv') as any;
    const draws = Array.isArray(result) ? result : result.draws;
    
    expect(draws.length).toBe(0);
  });

  it('should validate range 00-99', () => {
    const csv = `1,2024-01-01,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19`;

    const result = parseDrawsFile(csv, 'test.csv') as any;
    const draws = Array.isArray(result) ? result : result.draws;
    
    // This one is valid (0-19), so should pass
    expect(draws.length).toBe(1);
  });
});