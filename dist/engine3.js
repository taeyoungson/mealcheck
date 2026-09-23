(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MealEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CAPS = { b: 128, cd: 192, w: 128 };
  const MAX_PASSENGERS = 417;
  const MAIN_MAX = 311;
  const W_MAX = 106;
  const ZONES = ["b", "cd", "w"];
  const ZONE_LABELS = { b: "B", cd: "C/D", w: "W" };
  const int = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;

  function largestRemainder(total, ratios) {
    if (!ratios.length) return [];
    const ideals = ratios.map((ratio) => total * Number(ratio || 0) / 100);
    const result = ideals.map(Math.floor);
    let left = total - result.reduce((sum, n) => sum + n, 0);
    const order = ideals.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; i < left; i += 1) result[order[i % order.length].index] += 1;
    return result;
  }

  function closestAvailableMix(total, ratios, capacities) {
    const ideal = ratios.map((ratio) => total * Number(ratio || 0) / 100);
    const desired = largestRemainder(total, ratios);
    const result = desired.map((value, index) => Math.min(value, capacities[index]));
    let left = total - result.reduce((sum, value) => sum + value, 0);
    while (left > 0) {
      let choice = -1;
      let bestPenalty = Infinity;
      for (let i = 0; i < result.length; i += 1) {
        if (result[i] >= capacities[i]) continue;
        const penalty = Math.pow(result[i] + 1 - ideal[i], 2) - Math.pow(result[i] - ideal[i], 2);
        if (penalty < bestPenalty) { bestPenalty = penalty; choice = i; }
      }
      if (choice < 0) break;
      result[choice] += 1;
      left -= 1;
    }
    return result;
  }

  function allocateW(used, ratios, wPassengers) {
    const lowerPassengers = used.reduce((sum, n) => sum + n, 0) - wPassengers;
    const wIdeal = ratios.map((ratio) => wPassengers * ratio / 100);
    const lowerIdeal = ratios.map((ratio) => lowerPassengers * ratio / 100);
    let states = new Map([[0, { penalty: 0, values: [] }]]);
    used.forEach((count, index) => {
      const next = new Map();
      for (const [sumW, state] of states.entries()) {
        for (let wCount = 0; wCount <= count; wCount += 1) {
          const nextSum = sumW + wCount;
          if (nextSum > wPassengers) continue;
          const lowerCount = count - wCount;
          const penalty = state.penalty + Math.pow(wCount - wIdeal[index], 2) + Math.pow(lowerCount - lowerIdeal[index], 2);
          const current = next.get(nextSum);
          if (!current || penalty < current.penalty) next.set(nextSum, { penalty, values: [...state.values, wCount] });
        }
      }
      states = next;
    });
    return states.get(wPassengers)?.values || used.map(() => 0);
  }

  function enumerateLowerSplits(lowerCounts) {
    const base = lowerCounts.map((value) => Math.floor(value / 2));
    const odd = lowerCounts.map((value, index) => value % 2 ? index : -1).filter((index) => index >= 0);
    const total = lowerCounts.reduce((sum, value) => sum + value, 0);
    const allowed = new Set([Math.floor(total / 2), Math.ceil(total / 2)]);
    const results = [];
    const masks = Math.pow(2, odd.length);
    for (let mask = 0; mask < masks; mask += 1) {
      const split = [...base];
      odd.forEach((index, bit) => { if (mask & (1 << bit)) split[index] += 1; });
      if (allowed.has(split.reduce((sum, n) => sum + n, 0))) results.push(split);
    }
    return results.length ? results : [base];
  }

  function balancedLowerSplit(lowerCounts, targetB) {
    let states = new Map([[0, { penalty: 0, values: [] }]]);
    lowerCounts.forEach((count) => {
      const next = new Map();
      for (const [sum, state] of states.entries()) {
        for (let b = 0; b <= count; b += 1) {
          const total = sum + b;
          if (total > targetB) continue;
          const penalty = state.penalty + Math.pow(b - count / 2, 2);
          const current = next.get(total);
          if (!current || penalty < current.penalty) next.set(total, { penalty, values: [...state.values, b] });
        }
      }
      states = next;
    });
    return states.get(targetB)?.values || null;
  }

  function rebalance(stocks, demands) {
    const available = {};
    const needed = {};
    ZONES.forEach((zone) => {
      const local = Math.min(stocks[zone], demands[zone]);
      available[zone] = stocks[zone] - local;
      needed[zone] = demands[zone] - local;
    });
    const flows = [];
    ZONES.forEach((to) => {
      while (needed[to] > 0) {
        const from = ZONES.filter((zone) => zone !== to && available[zone] > 0)
          .sort((a, b) => available[b] - available[a])[0];
        if (!from) break;
        const count = Math.min(needed[to], available[from]);
        flows.push({ from, to, count });
        needed[to] -= count;
        available[from] -= count;
      }
    });
    return { flows, units: flows.reduce((sum, flow) => sum + flow.count, 0) };
  }

  function heatOption(menu, finals, bHeat) {
    const lowerUsed = finals.b + finals.cd;
    const heats = { b: bHeat, cd: lowerUsed - bHeat, w: finals.w };
    const cold = rebalance({ b: menu.bEntree, cd: menu.cdEntree, w: menu.wEntree }, heats);
    const hot = [];
    if (bHeat > finals.b) hot.push({ from: "b", to: "cd", count: bHeat - finals.b });
    if (bHeat < finals.b) hot.push({ from: "cd", to: "b", count: finals.b - bHeat });
    const hotUnits = hot.reduce((sum, flow) => sum + flow.count, 0);
    return { heats, coldFlows: cold.flows, hotFlows: hot, units: cold.units + hotUnits, hotUnits };
  }

  function optimizeHeating(menus, finals) {
    const totalW = finals.reduce((sum, final) => sum + final.w, 0);
    if (totalW > CAPS.w) return null;
    let states = new Map([[0, { units: 0, hotUnits: 0, choices: [] }]]);
    menus.forEach((menu, index) => {
      const next = new Map();
      const lowerUsed = finals[index].b + finals[index].cd;
      for (const [bTotal, state] of states.entries()) {
        for (let bHeat = 0; bHeat <= lowerUsed; bHeat += 1) {
          const nextB = bTotal + bHeat;
          if (nextB > CAPS.b) continue;
          const option = heatOption(menu, finals[index], bHeat);
          const nextCd = state.choices.reduce((sum, choice) => sum + choice.heats.cd, 0) + option.heats.cd;
          if (nextCd > CAPS.cd) continue;
          const candidate = { units: state.units + option.units, hotUnits: state.hotUnits + option.hotUnits, choices: [...state.choices, option] };
          const current = next.get(nextB);
          if (!current || candidate.units < current.units || (candidate.units === current.units && candidate.hotUnits < current.hotUnits)) next.set(nextB, candidate);
        }
      }
      states = next;
    });
    let best = null;
    for (const state of states.values()) {
      const heats = { b: 0, cd: 0, w: 0 };
      state.choices.forEach((choice) => ZONES.forEach((zone) => { heats[zone] += choice.heats[zone]; }));
      if (!best || state.units < best.units || (state.units === best.units && state.hotUnits < best.hotUnits)) best = { ...state, heats };
    }
    return best;
  }

  function optimizeDistribution(menus, wCounts, fixedFinals = {}) {
    const flexible = menus.map((menu, index) => ({ menu, index })).filter(({ menu }) => !menu.special);
    const fixed = menus.map((menu, index) => ({ menu, index })).filter(({ menu }) => menu.special);
    const lowerCounts = flexible.map(({ menu, index }) => menu.used - wCounts[index]);
    const fixedB = fixed.reduce((sum, { index }) => sum + fixedFinals[index].b, 0);
    const totalLower = menus.reduce((sum, menu, index) => sum + menu.used - wCounts[index], 0);
    const regularLower = lowerCounts.reduce((sum, value) => sum + value, 0);
    const targetTotals = [...new Set([Math.floor(totalLower / 2), Math.ceil(totalLower / 2)])];
    const splits = targetTotals.map((target) => Math.max(0, Math.min(regularLower, target - fixedB)))
      .filter((target, index, values) => values.indexOf(target) === index)
      .map((target) => balancedLowerSplit(lowerCounts, target)).filter(Boolean);
    let best = null;
    splits.forEach((bCounts) => {
      let flexIndex = 0;
      const finals = menus.map((menu, index) => {
        if (menu.special) return fixedFinals[index];
        const b = bCounts[flexIndex];
        const lower = lowerCounts[flexIndex];
        flexIndex += 1;
        return { b, cd: lower - b, w: wCounts[index] };
      });
      const trayPlans = menus.map((menu, index) => rebalance(
        { b: menu.bTray, cd: menu.cdTray, w: menu.wTray }, finals[index]
      ));
      const heating = optimizeHeating(menus, finals);
      if (!heating) return;
      const details = menus.map((menu, index) => ({
        ...menu,
        finals: finals[index],
        trayFlows: trayPlans[index].flows,
        ...heating.choices[index],
      }));
      const groupSet = new Set();
      details.forEach((item) => {
        item.trayFlows.forEach((flow) => groupSet.add(`tray:${flow.from}>${flow.to}`));
        item.coldFlows.forEach((flow) => groupSet.add(`cold:${flow.from}>${flow.to}`));
        item.hotFlows.forEach((flow) => groupSet.add(`hot:${flow.from}>${flow.to}`));
      });
      const trayUnits = trayPlans.reduce((sum, plan) => sum + plan.units, 0);
      const candidate = { details, heats: heating.heats, groups: groupSet.size, units: trayUnits + heating.units, hotUnits: heating.hotUnits };
      if (!best || candidate.groups < best.groups || (candidate.groups === best.groups && candidate.units < best.units) || (candidate.groups === best.groups && candidate.units === best.units && candidate.hotUnits < best.hotUnits)) best = candidate;
    });
    return best;
  }

  function validateService(passengers, wPassengers, rawMenus, options = {}) {
    const blockers = [];
    const warnings = [];
    const notes = [];
    const pax = int(passengers);
    const wPax = int(wPassengers);
    const lowerPax = pax - wPax;
    const requestInput = options.specialRequests || { b: 0, cd: 0, w: 0 };
    const specialRequests = { b: int(requestInput.b), cd: int(requestInput.cd), w: int(requestInput.w) };
    const specialTotal = ZONES.reduce((sum, zone) => sum + specialRequests[zone], 0);
    const regularPax = pax - specialTotal;
    const regularRaw = rawMenus.filter((menu) => !menu.special);
    const specialRaw = rawMenus.filter((menu) => menu.special);
    if (!Number.isInteger(Number(passengers)) || pax < 1 || pax > MAX_PASSENGERS) blockers.push({ title: `전체 승객 수는 1~${MAX_PASSENGERS}명의 정수여야 합니다.`, detail: "아시아나 A380 이코노미 전체 좌석 기준입니다." });
    if (!Number.isInteger(Number(wPassengers)) || wPax < 0 || wPax > W_MAX) blockers.push({ title: `W존 승객 수는 0~${W_MAX}명의 정수여야 합니다.`, detail: "윗층 이코노미 좌석 기준입니다." });
    if (lowerPax < 0 || lowerPax > MAIN_MAX) blockers.push({ title: `메인덱 승객 수가 허용 범위를 벗어났습니다.`, detail: `전체 ${pax}명 - W존 ${wPax}명 = 메인덱 ${lowerPax}명. 메인덱은 최대 ${MAIN_MAX}명입니다.` });
    ZONES.forEach((zone) => {
      if (!Number.isInteger(Number(requestInput[zone])) || Number(requestInput[zone]) < 0) blockers.push({ title: `${ZONE_LABELS[zone]} 스페셜밀 신청자 수가 올바르지 않습니다.`, detail: "0 이상의 정수로 입력해 주세요." });
    });
    if (specialRequests.w > wPax) blockers.push({ title: "W존 스페셜밀 신청자가 W존 승객보다 많습니다.", detail: `W존 승객 ${wPax}명 · 신청자 ${specialRequests.w}명` });
    if (specialRequests.b + specialRequests.cd > lowerPax) blockers.push({ title: "메인덱 스페셜밀 신청자가 메인덱 승객보다 많습니다.", detail: `메인덱 승객 ${lowerPax}명 · B/C/D 신청자 ${specialRequests.b + specialRequests.cd}명` });
    if (regularPax < 0) blockers.push({ title: "스페셜밀 신청자가 전체 승객보다 많습니다.", detail: `전체 승객 ${pax}명 · 신청자 ${specialTotal}명` });
    if (!regularRaw.length) blockers.push({ title: "일반 메뉴가 없습니다.", detail: "최소 한 개의 일반 메뉴를 추가해 주세요." });
    if (specialRaw.length > 1) blockers.push({ title: "스페셜밀 메뉴가 중복되었습니다.", detail: "스페셜밀 메뉴는 서비스당 한 개만 사용할 수 있습니다." });
    if (specialTotal > 0 && specialRaw.length !== 1) blockers.push({ title: "스페셜밀 메뉴가 없습니다.", detail: "신청자가 있으면 스페셜밀 메뉴가 필요합니다." });
    const ratioSum = regularRaw.reduce((sum, menu) => sum + Number(menu.ratio || 0), 0);
    if (Math.abs(ratioSum - 100) > 0.0001) blockers.push({ title: `메뉴 비율 합계가 ${ratioSum}%입니다.`, detail: "비율 합계가 정확히 100%가 되어야 합니다." });
    rawMenus.forEach((menu, index) => {
      const fields = [menu.bTray, menu.bEntree, menu.cdTray, menu.cdEntree, menu.wTray, menu.wEntree];
      if (!menu.special) fields.unshift(menu.ratio);
      if (!String(menu.name || "").trim()) blockers.push({ title: `${index + 1}번 메뉴 이름이 없습니다.`, detail: "메뉴를 구분할 이름을 입력해 주세요." });
      if (fields.some((value) => Number(value) < 0 || !Number.isFinite(Number(value)))) blockers.push({ title: `${menu.name || index + 1} 메뉴의 수량이 올바르지 않습니다.`, detail: "0 이상의 숫자만 입력해 주세요." });
      const countFields = menu.special ? fields : fields.slice(1);
      if (countFields.some((value) => !Number.isInteger(Number(value)))) blockers.push({ title: `${menu.name || index + 1} 메뉴 수량은 정수여야 합니다.`, detail: "트레이와 앙트레는 개수 단위로 입력합니다." });
    });
    if (options.firstService) {
      ZONES.forEach((zone) => {
        const total = rawMenus.reduce((sum, menu) => sum + int(menu[`${zone}Entree`]), 0);
        if (total > CAPS[zone]) blockers.push({ title: `${ZONE_LABELS[zone]} 갤리 초기 앙트레가 ${total - CAPS[zone]}개 초과했습니다.`, detail: `1번째 식사는 처음부터 오븐에 적재됩니다. ${ZONE_LABELS[zone]} 갤리는 최대 ${CAPS[zone]}개까지 입력할 수 있습니다.` });
      });
    }
    if (blockers.length) return { blockers, warnings, notes, ready: false, menus: [], pax, wPax, lowerPax };

    const ratios = regularRaw.map((menu) => Number(menu.ratio));
    const overallTarget = largestRemainder(regularPax, ratios);
    let regularIndex = 0;
    const menus = rawMenus.map((menu) => {
      const parsed = { ...menu };
      ZONES.forEach((zone) => {
        parsed[`${zone}Tray`] = int(menu[`${zone}Tray`]);
        parsed[`${zone}Entree`] = int(menu[`${zone}Entree`]);
      });
      parsed.trayTotal = ZONES.reduce((sum, zone) => sum + parsed[`${zone}Tray`], 0);
      parsed.entreeTotal = ZONES.reduce((sum, zone) => sum + parsed[`${zone}Entree`], 0);
      parsed.available = Math.min(parsed.trayTotal, parsed.entreeTotal);
      parsed.target = menu.special ? specialTotal : overallTarget[regularIndex++];
      if (parsed.trayTotal !== parsed.entreeTotal) {
        const difference = Math.abs(parsed.trayTotal - parsed.entreeTotal);
        const direction = parsed.trayTotal > parsed.entreeTotal ? "많습니다" : "적습니다";
        warnings.push({ title: `${menu.name}: 트레이가 앙트레보다 ${difference}개 ${direction}.`, detail: `트레이 ${parsed.trayTotal}개 · 앙트레 ${parsed.entreeTotal}개 · 완성 가능 ${parsed.available}개` });
      }
      return parsed;
    });
    const regularMenus = menus.filter((menu) => !menu.special);
    const specialMenu = menus.find((menu) => menu.special);
    const regularAvailable = regularMenus.reduce((sum, menu) => sum + menu.available, 0);
    const specialAvailable = specialMenu?.available || 0;
    const totalAvailable = regularAvailable + specialAvailable;
    if (regularAvailable < regularPax) blockers.push({ title: `일반식이 ${regularPax - regularAvailable}개 부족합니다.`, detail: `일반식 대상 ${regularPax}명 · 완성 가능 일반식 ${regularAvailable}개. 스페셜밀 여분은 일반식을 대신할 수 없습니다.` });
    if (specialAvailable < specialTotal) blockers.push({ title: `스페셜밀이 ${specialTotal - specialAvailable}개 부족합니다.`, detail: `신청자 ${specialTotal}명 · 완성 가능 스페셜밀 ${specialAvailable}개` });
    if (blockers.length) return { blockers, warnings, notes, ready: false, menus, pax, wPax, lowerPax, totalAvailable };

    const regularUsed = closestAvailableMix(regularPax, ratios, regularMenus.map((menu) => menu.available));
    regularMenus.forEach((menu, index) => { menu.used = regularUsed[index]; });
    if (specialMenu) specialMenu.used = specialTotal;
    const used = menus.map((menu) => menu.used || 0);
    const changed = regularMenus.filter((menu) => menu.used !== menu.target);
    if (changed.length) warnings.push({ title: "목표 메뉴 비율과 정확히 일치하지 않습니다.", detail: changed.map((menu) => `${menu.name}: 목표 ${menu.target}개 → 가능 ${menu.used}개`).join(" · ") });
    const loadedTarget = largestRemainder(regularAvailable, ratios);
    const loadedMismatch = regularMenus.filter((menu, index) => menu.available !== loadedTarget[index]);
    if (loadedMismatch.length) warnings.push({ title: "전체 탑재 비율이 예정 비율과 정확히 일치하지 않습니다.", detail: loadedMismatch.map((menu, index) => `${menu.name}: 기준 ${loadedTarget[index]}개 / 실제 ${menu.available}개`).join(" · ") });
    const excess = Math.max(0, regularAvailable - regularPax) + Math.max(0, specialAvailable - specialTotal);
    if (excess > 0) notes.push({ title: `서비스 제외 여분 ${excess}개`, detail: "필요하지 않은 여분은 오븐에서 빼놓을 수 있습니다." });

    const regularW = allocateW(regularUsed, ratios, wPax - specialRequests.w);
    let wIndex = 0;
    const wCounts = menus.map((menu) => menu.special ? specialRequests.w : regularW[wIndex++]);
    const fixedFinals = {};
    menus.forEach((menu, index) => { if (menu.special) fixedFinals[index] = { ...specialRequests }; });
    const plan = optimizeDistribution(menus, wCounts, fixedFinals);
    if (!plan) blockers.push({ title: "오븐 용량 안에서 배분할 수 없습니다.", detail: `B ${CAPS.b}개 · C/D ${CAPS.cd}개 · W ${CAPS.w}개 제한을 확인해 주세요.` });
    return { blockers, warnings, notes, ready: blockers.length === 0, menus, used, totalAvailable, pax, wPax, lowerPax, regularPax, specialRequests, specialTotal, plan };
  }

  function flowLines(details, key) {
    const lines = [];
    details.forEach((item) => (item[key] || []).forEach((flow) => lines.push({ ...flow, menuId: item.id, name: item.name })));
    return lines;
  }

  function groupFlowTask(kind, title, flows, itemType) {
    if (!flows.length) return null;
    const grouped = new Map();
    flows.forEach((flow) => {
      const key = `${flow.from}>${flow.to}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(flow);
    });
    const routeText = [...grouped.entries()].map(([route, list]) => {
      const [from, to] = route.split(">");
      return `${ZONE_LABELS[from]} → ${ZONE_LABELS[to]} · ${list.map((flow) => `${flow.name} ${flow.count}개`).join(", ")}`;
    });
    return {
      kind,
      title,
      summary: routeText.join("\n"),
      mutations: flows.map((flow) => ({ menuId: flow.menuId, from: `${flow.from}${itemType}`, to: `${flow.to}${itemType}`, count: flow.count })),
    };
  }

  function buildTodos(result) {
    if (!result.ready || !result.plan) return [];
    const details = result.plan.details;
    const todos = [];
    const trayTask = groupFlowTask("tray", "트레이 재배치", flowLines(details, "trayFlows"), "Tray");
    const coldTask = groupFlowTask("cold", "가열 전 앙트레 재배치", flowLines(details, "coldFlows"), "Entree");
    if (trayTask) todos.push(trayTask);
    if (coldTask) todos.push(coldTask);
    const hotTask = groupFlowTask("hot", "가열 후 앙트레 재배치", flowLines(details, "hotFlows"), "Entree");
    const heatSummary = `B ${result.plan.heats.b}개 · C/D ${result.plan.heats.cd}개 · W ${result.plan.heats.w}개 가열`;
    if (hotTask) {
      hotTask.title = "앙트레 가열 후 재배치";
      hotTask.summary = `${heatSummary}\n${hotTask.summary}`;
      todos.push(hotTask);
    } else {
      todos.push({ kind: "heat", title: "앙트레 가열 후 재배치", summary: `${heatSummary} · 이동 없음`, mutations: [] });
    }
    const totals = { b: 0, cd: 0, w: 0 };
    details.forEach((item) => ZONES.forEach((zone) => { totals[zone] += item.finals[zone]; }));
    todos.push({ kind: "final", title: "카트 최종 확인", summary: `B ${totals.b}식 · C/D ${totals.cd}식 · W ${totals.w}식`, mutations: [] });
    return todos;
  }

  return { validateService, buildTodos, largestRemainder, CAPS, MAX_PASSENGERS, MAIN_MAX, W_MAX, ZONE_LABELS };
});
