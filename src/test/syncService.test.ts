import { describe, it, expect } from "vitest";
import { validateDraw } from "../services/contestService";

describe("Defensive API Sync Validation (Lotomania Strict Rules)", () => {
    it("must ACCEPT an array of exactly 50 unique numbers in standard lotomania domain (0..99)", () => {
        const valid50 = Array.from({ length: 50 }, (_, i) => i);
        const result = validateDraw(valid50);
        expect(Array.isArray(result)).toBe(true);
        if (Array.isArray(result)) {
            expect(result.length).toBe(50);
            expect(result[0]).toBe("00");
            expect(result[49]).toBe("49");
        }
    });

    it("must REJECT arrays with less than 50 numbers (e.g., standard 20 drawn numbers)", () => {
        // API returns 20 numbers for drawn lotomania typically.
        // Client strictly requested the domain requires 50 to be considered valid here.
        const drawn20 = Array.from({ length: 20 }, (_, i) => i);
        const result = validateDraw(drawn20);
        expect(result).toHaveProperty("error");
        if (!Array.isArray(result)) {
            expect(result.error).toMatch(/invalid_length_expected_50/);
        }
    });

    it("must REJECT arrays with more than 50 numbers", () => {
        const invalid51 = Array.from({ length: 51 }, (_, i) => i);
        const result = validateDraw(invalid51);
        expect(result).toHaveProperty("error");
    });

    it("must REJECT domains out of bounds (<0 or >99)", () => {
        const outBounds = Array.from({ length: 49 }, (_, i) => i + 1);
        outBounds.push(100); // Invalid lotomania number
        const result = validateDraw(outBounds);
        expect(result).toHaveProperty("error");
    });

    it("must REJECT duplicate numbers internally", () => {
        const duplicates = Array.from({ length: 49 }, (_, i) => i);
        duplicates.push(0); // Duplicate the zero to make length 50 but unique 49
        const result = validateDraw(duplicates);
        expect(result).toHaveProperty("error");
        if (!Array.isArray(result)) {
            expect(result.error).toBe("duplicate_numbers");
        }
    });

    it("must NORMALISE inputs correctly from string representations", () => {
        const strInput = Array.from({ length: 50 }, (_, i) => `${i}`);
        const result = validateDraw(strInput);
        expect(Array.isArray(result)).toBe(true);
    });
});
