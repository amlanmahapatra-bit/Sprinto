import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { quoteFound } from "@/lib/engine/quoteCheck";
import { entityMatches } from "@/lib/engine/entityCheck";

const ROOT = path.resolve(__dirname, "..");
function page(domain: string, name: string): string {
  return fs.readFileSync(path.join(ROOT, "tests/fixtures/pages", domain, `${name}.md`), "utf8");
}

describe("quote check (E1)", () => {
  const security = page("ledgerly.example", "security");

  it("keeps a value whose quote is in the page (whitespace/case-insensitive)", () => {
    expect(quoteFound("We are currently working toward SOC 2 Type II", security)).toBe(true);
    expect(quoteFound("we ARE   currently working   toward soc 2 type ii", security)).toBe(true);
  });

  it("drops a value whose quote is not in the page", () => {
    expect(quoteFound("We are SOC 2 Type II certified since 2023", security)).toBe(false);
    expect(quoteFound("", security)).toBe(false);
  });
});

describe("entity check (E3)", () => {
  it("accepts when the domain appears", () => {
    expect(
      entityMatches("OrbitFleet (orbitfleet.example) raises Series A", {
        domain: "orbitfleet.example",
        companyName: "OrbitFleet",
      }),
    ).toBe(true);
  });

  it("accepts company name + a corroborator", () => {
    expect(
      entityMatches("OrbitFleet, the Bengaluru logistics startup, raised funding", {
        domain: "orbitfleet.example",
        companyName: "OrbitFleet",
        corroborators: ["Bengaluru"],
      }),
    ).toBe(true);
  });

  it("rejects a name-only match with no corroborator", () => {
    expect(
      entityMatches("A totally different OrbitFleet brand of e-bikes launched", {
        domain: "orbitfleet.example",
        companyName: "OrbitFleet",
      }),
    ).toBe(false);
  });
});
