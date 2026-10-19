import { describe, expect, it } from "vitest";
import { addSet, addTool, defaultChest, exportChest, importChest, removeSet, removeTool, updateTool } from "./toolchest";
describe("tool chest", () => {
  it("default chest has electrical sets and an empty My Symbols set", () => {
    const c = defaultChest();
    expect(c.sets.some((s) => s.name.includes("Devices") && s.tools.length > 5)).toBe(true);
    expect(c.sets.find((s) => s.name === "My Symbols")?.tools).toEqual([]);
  });
  it("add / update / remove tool and set", () => {
    let c = defaultChest(); const mine = c.sets.find((s) => s.name === "My Symbols")!;
    c = addTool(c, mine.id, { name: "Exit sign", kind: "count", color: "#ff0000", lineWidth: 2, label: "Exit sign", symbol: { shape: "triangle", text: "X", size: 14 } });
    const t = c.sets.find((s) => s.id === mine.id)!.tools[0]; expect(t.name).toBe("Exit sign");
    c = updateTool(c, mine.id, t.id, { color: "#00ff00", id: "hack" });
    expect(c.sets.find((s) => s.id === mine.id)!.tools[0]).toMatchObject({ color: "#00ff00", id: t.id });
    c = removeTool(c, mine.id, t.id); expect(c.sets.find((s) => s.id === mine.id)!.tools.length).toBe(0);
    c = addSet(c, "Fire alarm"); expect(c.sets.at(-1)!.name).toBe("Fire alarm");
    c = removeSet(c, c.sets.at(-1)!.id); expect(c.sets.some((s) => s.name === "Fire alarm")).toBe(false);
  });
  it("export then import round-trips with fresh ids", () => {
    const a = defaultChest(); const r = importChest(exportChest(a), { version: 1, sets: [] });
    expect(r.addedSets).toBe(a.sets.length); expect(r.skipped).toBe(0);
    expect(r.chest.sets[0].tools[0].id).not.toBe(a.sets[0].tools[0].id);
    expect(r.chest.sets[0].tools[0].name).toBe(a.sets[0].tools[0].name);
  });
  it("import rejects junk and drops malformed tools", () => {
    expect(() => importChest("nope", defaultChest())).toThrow();
    expect(() => importChest('{"a":1}', defaultChest())).toThrow();
    const r = importChest(JSON.stringify({ sets: [{ name: "x", tools: [{ name: "ok", kind: "count", color: "red" }, { name: "bad", kind: "hack" }, 5] }] }), { version: 1, sets: [] });
    expect(r.addedTools).toBe(1); expect(r.skipped).toBe(2); expect(r.chest.sets[0].tools[0].color).toBe("#2563eb");
  });
});
