const assert = require("node:assert/strict");
const Engine = require("./dist/engine3.js");

assert.deepEqual(Engine.largestRemainder(417, [50, 30, 20]), [209, 125, 83]);

const sample = [
  { id: "k", name: "한식", ratio: 50, bTray: 68, bEntree: 60, cdTray: 84, cdEntree: 90, wTray: 50, wEntree: 50 },
  { id: "a", name: "양식 A", ratio: 30, bTray: 55, bEntree: 38, cdTray: 35, cdEntree: 52, wTray: 30, wEntree: 30 },
  { id: "b", name: "양식 B", ratio: 20, bTray: 20, bEntree: 30, cdTray: 42, cdEntree: 30, wTray: 18, wEntree: 20 },
];
const valid = Engine.validateService(400, 100, sample, { firstService: true });
assert.equal(valid.ready, true);
assert.equal(valid.used.reduce((a, b) => a + b, 0), 400);
assert.ok(valid.plan.heats.b <= 128 && valid.plan.heats.cd <= 192 && valid.plan.heats.w <= 128);
assert.equal(valid.plan.heats.w, 100);
const finalTotals = { b: 0, cd: 0, w: 0 };
valid.plan.details.forEach((item) => Object.keys(finalTotals).forEach((zone) => { finalTotals[zone] += item.finals[zone]; }));
assert.deepEqual(finalTotals, { b: 150, cd: 150, w: 100 });
valid.plan.details.flatMap((item) => item.hotFlows).forEach((flow) => assert.ok(flow.from !== "w" && flow.to !== "w"));
assert.ok(Engine.buildTodos(valid).length <= 4);
assert.equal(Engine.buildTodos(valid).some((todo) => todo.title === "앙트레 가열"), false);
assert.ok(Engine.buildTodos(valid).some((todo) => todo.title === "앙트레 가열 후 재배치"));

const withSpecial = Engine.validateService(400, 100, [
  ...sample,
  { id: "s", name: "스페셜밀", type: "특별식", ratio: 0, special: true, bTray: 0, bEntree: 0, cdTray: 9, cdEntree: 9, wTray: 0, wEntree: 0 },
], { firstService: true, specialRequests: { b: 3, cd: 4, w: 2 } });
assert.equal(withSpecial.ready, true);
assert.equal(withSpecial.regularPax, 391);
assert.equal(withSpecial.menus.filter((item) => !item.special).reduce((sum, item) => sum + item.used, 0), 391);
const specialDetail = withSpecial.plan.details.find((item) => item.special);
assert.deepEqual(specialDetail.finals, { b: 3, cd: 4, w: 2 });
assert.equal(specialDetail.heats.w, 2);
assert.ok(specialDetail.coldFlows.some((flow) => flow.from === "cd" && flow.to === "w" && flow.count === 2));
assert.ok(specialDetail.hotFlows.every((flow) => flow.from !== "w" && flow.to !== "w"));

const specialShortage = Engine.validateService(400, 100, [
  ...sample,
  { id: "s", name: "스페셜밀", type: "특별식", ratio: 0, special: true, bTray: 8, bEntree: 8, cdTray: 0, cdEntree: 0, wTray: 0, wEntree: 0 },
], { specialRequests: { b: 3, cd: 4, w: 2 } });
assert.equal(specialShortage.ready, false);
assert.ok(specialShortage.blockers.some((item) => item.title.includes("스페셜밀이 1개 부족")));

const overW = Engine.validateService(200, 100, [
  { id: "k", name: "한식", ratio: 100, bTray: 50, bEntree: 40, cdTray: 50, cdEntree: 30, wTray: 100, wEntree: 130 },
], { firstService: true });
assert.equal(overW.ready, false);
assert.ok(overW.blockers.some((item) => item.title.includes("W 갤리 초기 앙트레")));

const later = Engine.validateService(200, 100, [
  { id: "k", name: "한식", ratio: 100, bTray: 50, bEntree: 40, cdTray: 50, cdEntree: 30, wTray: 100, wEntree: 130 },
], { firstService: false });
assert.equal(later.ready, true);
assert.equal(later.plan.heats.w, 100);

const shortage = Engine.validateService(300, 80, [
  { id: "k", name: "한식", ratio: 50, bTray: 60, bEntree: 60, cdTray: 60, cdEntree: 60, wTray: 20, wEntree: 20 },
  { id: "a", name: "양식", ratio: 50, bTray: 50, bEntree: 50, cdTray: 50, cdEntree: 50, wTray: 20, wEntree: 20 },
]);
assert.equal(shortage.ready, false);
assert.ok(shortage.blockers.some((item) => item.title.includes("부족")));

console.log("three-zone engine tests passed");
