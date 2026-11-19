/*
 * SKY REAPER QA playtest bot (runs INSIDE the page; injected by tests/qa/playtest.mjs).
 * Plain browser script: defines window.__qaInstall(opts) which hooks the running game scene:
 *   - replaces InputService.poll() with a scripted pilot (danger-field dodging over 33 straight-line escape candidates,
 *     hold fire, bombs on ground targets, flares on missile lock / imminent unavoidable hit)
 *   - optional turbo: extra fixed sim steps per rendered frame (same SIM_DT, deterministic logic; not for FPS numbers)
 *   - logs damage sources, deaths, bullets, escape-area fairness samples, missiles, boss phases, hints, FPS
 * Does not modify any game code; only reads world state through window.__sky (SkyDebug QA hook).
 */
(function () {
  "use strict";
  window.__qaInstall = function (opts) {
    opts = opts || {};
    var sky = window.__sky;
    var w = sky.game.world;
    var k = sky.services.k;
    var input = sky.services.input;
    var GW = k.width();
    var GH = k.height();
    var SIM_DT = 1 / 60;
    var turbo = Math.max(1, opts.turbo | 0 || 1);
    var godRun = !!opts.god;
    var maxSimSec = opts.maxSimSec || 600;
    var hSpeedMul = Math.max(1, Math.min(1.6, Math.sqrt(GW / 480)));
    var spd = (w.pc && w.pc.loadout && w.pc.loadout.speed) || 270;

    var L = {
      gw: GW,
      gh: GH,
      turbo: turbo,
      hits: [],
      deaths: [],
      dmgBySource: {},
      hitsBySource: {},
      maxBullets: 0,
      maxBulletsT: 0,
      bulletSamples: 0,
      bulletSum: 0,
      bossSpawnT: null,
      bossPhases: [],
      bossDefeatT: null,
      bossId: null,
      escape: { samples: 0, zero: 0, low: 0, zeroEvents: [] },
      missiles: { launched: 0, hits: 0, flared: 0, maxSpeed: 0, kinds: {} },
      flaresUsed: 0,
      bombsPressed: 0,
      hints: [],
      banners: [],
      fps: { frames: 0, t0: 0, secs: [], worstMs: 0 },
      outcome: null,
      endT: null,
      errors: [],
      immunePings: 0,
      immuneByTarget: {},
      hitsUnavoidable: 0,
      hitsWithEscape: 0,
      contactHits: 0,
    };
    window.__qaLog = L;

    // ---------------------------------------------------------------- owner bookkeeping
    var ownerDef = {}; // enemy id -> def id
    function defOf(id) {
      if (!id) return "?";
      if (ownerDef[id]) return ownerDef[id];
      var en = w.enemies;
      for (var i = 0; i < en.length; i++) if (en[i].id === id) return (ownerDef[id] = en[i].def.id);
      return "?";
    }
    var lastThreat = { owner: "?", kind: "bullet" };
    var escapeHist = []; // [t, safeFrac]
    var seenMissile = new Set();

    var ev = w.events;
    ev.on("enemySpawned", function (p) {
      ownerDef[p.enemy.id] = p.enemy.def.id;
    });
    ev.on("playerHit", function (p) {
      var src = p.source;
      var attributed = src;
      if (src === "bullet" || src === "missile" || src === "blast") attributed = src + ":" + lastThreat.owner;
      else L.contactHits++;
      // escape area just before the hit (most recent sample within 0.5 s, minimum over that window)
      var minSafe = 1;
      for (var i = escapeHist.length - 1; i >= 0; i--) {
        if (w.time - escapeHist[i][0] > 0.5) break;
        minSafe = Math.min(minSafe, escapeHist[i][1]);
      }
      if (minSafe === 0) L.hitsUnavoidable++;
      else L.hitsWithEscape++;
      L.hits.push({ t: +w.time.toFixed(2), dmg: +p.damage.toFixed(1), src: attributed, minSafe: +minSafe.toFixed(3), hp: Math.round(w.player.hp), sh: Math.round(w.player.shield) });
      L.dmgBySource[attributed] = (L.dmgBySource[attributed] || 0) + p.damage;
      L.hitsBySource[attributed] = (L.hitsBySource[attributed] || 0) + 1;
      if (src === "missile" || (src === "blast" && lastThreat.kind === "missile")) L.missiles.hits++;
    });
    ev.on("playerDied", function (p) {
      var last = L.hits[L.hits.length - 1];
      L.deaths.push({ t: +w.time.toFixed(2), livesLeft: p.lives, killer: last ? last.src : "?" });
    });
    ev.on("missileLaunched", function () {
      L.missiles.launched++;
    });
    ev.on("flareUsed", function () {
      L.flaresUsed++;
    });
    ev.on("bossSpawned", function (p) {
      L.bossSpawnT = w.time;
      L.bossId = p.bossId;
    });
    ev.on("bossPhase", function (p) {
      var hud = null;
      try {
        hud = w.boss && w.boss.hud();
      } catch (e) {}
      L.bossPhases.push({ phase: p.phase, t: +w.time.toFixed(2), sinceSpawn: L.bossSpawnT != null ? +(w.time - L.bossSpawnT).toFixed(2) : null, hp: hud ? Math.round(hud.hp) : null, maxHp: hud ? Math.round(hud.maxHp) : null });
    });
    ev.on("bossDefeated", function () {
      L.bossDefeatT = w.time;
    });
    ev.on("chapterComplete", function () {
      L.outcome = "victory";
      L.endT = w.time;
    });
    ev.on("chapterFailed", function () {
      L.outcome = "failed";
      L.endT = w.time;
    });
    ev.on("banner", function (b) {
      L.banners.push({ t: +w.time.toFixed(1), text: b.text, sub: b.subtext || "" });
    });
    ev.on("enemyImmune", function (p) {
      L.immunePings++;
      var id = p.enemy.def.id + "/" + p.byClass;
      L.immuneByTarget[id] = (L.immuneByTarget[id] || 0) + 1;
    });

    // ---------------------------------------------------------------- candidate moves
    var CANDS = [[0, 0]];
    for (var a = 0; a < 16; a++) {
      var ang = (a / 16) * Math.PI * 2;
      CANDS.push([Math.cos(ang), Math.sin(ang)]);
      CANDS.push([Math.cos(ang) * 0.5, Math.sin(ang) * 0.5]);
    }
    var TIMES = [0.08, 0.16, 0.25, 0.35, 0.5, 0.7];
    var HARD_T = 0.35; // fairness horizon: any straight-line escape that survives 0.35 s
    var MX = 18,
      MT = 70,
      MB = 34;

    function clampX(x) {
      return x < MX ? MX : x > GW - MX ? GW - MX : x;
    }
    function clampY(y) {
      return y < MT ? MT : y > GH - MB ? GH - MB : y;
    }

    var PERCEIVE = 330;
    var threats = []; // {x,y,vx,vy,r,missile,owner}
    function gatherThreats(p) {
      threats.length = 0;
      var eb = w.eBullets.items;
      var range = PERCEIVE;
      var near = 0;
      for (var i = 0; i < eb.length; i++) {
        var b = eb[i];
        var dx = b.x - p.x,
          dy = b.y - p.y;
        if (dx * dx + dy * dy > range * range) continue;
        var r = (b.blastRadius > 0 ? Math.max(b.radius, b.blastRadius * 0.45) : b.radius * 0.9) + p.hitRadius;
        threats.push({ x: b.x, y: b.y, vx: b.vx || 0, vy: b.vy || 0, r: r, missile: !!b.isMissile, owner: b.ownerId, hz: false, tl: 0 });
        if (dx * dx + dy * dy < 120 * 120) near++;
      }
      var hz = w.hazards.items;
      for (var j = 0; j < hz.length; j++) {
        var h = hz[j];
        if (h.cls !== "enemy" || h.state !== 0) continue;
        threats.push({ x: h.x, y: h.y, vx: 0, vy: h.anchored ? w.scrollSpeed : 0, r: h.radius + p.hitRadius, missile: false, owner: 0, hz: true, tl: h.telegraph - h.t });
      }
      var en = w.enemies;
      for (var m = 0; m < en.length; m++) {
        var e = en[m];
        if (!e.alive || e.def.layer !== "air" || !(e.def.contactDamage > 0) || !e.onScreen) continue;
        var hw = e.hw || 16,
          hh = e.hh || 16;
        threats.push({ x: e.x, y: e.y, vx: e.vx || 0, vy: e.vy || 0, r: Math.max(hw, hh) * 0.85 + p.hitRadius + 2, missile: false, owner: e.id, hz: false, tl: 0, body: true });
      }
      return near;
    }

    // evaluate a candidate: returns [hardHitTime or -1, softDanger, endX, endY]
    function evalCand(p, c) {
      var vx = c[0] * spd * hSpeedMul,
        vy = c[1] * spd;
      var hardT = -1,
        soft = 0;
      for (var ti = 0; ti < TIMES.length; ti++) {
        var t = TIMES[ti];
        var px = clampX(p.x + vx * t),
          py = clampY(p.y + vy * t);
        for (var i = 0; i < threats.length; i++) {
          var th = threats[i];
          var bx, by, rr;
          if (th.hz) {
            // telegraphed blast: dangerous only if it detonates around this time
            if (th.tl > t + 0.12) {
              continue;
            }
            bx = th.x;
            by = th.y + th.vy * Math.max(0, Math.min(t, th.tl));
            rr = th.r + 3;
          } else {
            bx = th.x + th.vx * t;
            by = th.y + th.vy * t;
            rr = th.r;
          }
          var dx = px - bx,
            dy = py - by;
          var d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) {
            if (hardT < 0) hardT = t;
            soft += 40 / (t + 0.05);
          } else {
            var d = Math.sqrt(d2) - rr;
            if (d < 26) soft += ((26 - d) / 26) * (th.missile ? 3 : 1.2) / (t + 0.15);
          }
        }
      }
      return [hardT, soft, clampX(p.x + vx * 0.35), clampY(p.y + vy * 0.35)];
    }

    // ---------------------------------------------------------------- goal selection
    function pickGoal(p) {
      var gx = GW / 2,
        gy = GH - 170;
      var bestAir = null,
        bestAirD = 1e9,
        bestGround = null,
        bestGroundD = 1e9;
      var en = w.enemies;
      var sc = w.scrollSpeed;
      for (var i = 0; i < en.length; i++) {
        var e = en[i];
        if (!e.alive || e.invuln || e.def.destructible === false) continue;
        if (e.y < 10 || e.y > GH - 40 || e.x < 0 || e.x > GW) continue;
        var vul = e.def.vulnerableTo;
        var gunOk = e.def.layer === "air" ? vul !== "ground" : vul === "air" || vul === "both";
        if (gunOk && e.y < p.y - 40) {
          var d = Math.abs(e.x - p.x) + (p.y - e.y) * 0.25 + (e.bossId ? -150 : 0);
          if (d < bestAirD) {
            bestAirD = d;
            bestAir = e;
          }
        }
        if (e.def.layer === "ground" && vul !== "air" && p.bombs > 0) {
          var dg = Math.abs(e.x - p.x) + Math.abs(e.y + 220 + sc * 0.6 - p.y) * 0.6 + (e.bossId ? -150 : 0);
          if (dg < bestGroundD) {
            bestGroundD = dg;
            bestGround = e;
          }
        }
      }
      if (bestGround && (!bestAir || bestGroundD < bestAirD * 0.9)) {
        gx = bestGround.x;
        gy = Math.min(GH - 60, Math.max(GH * 0.45, bestGround.y + 220 + sc * 0.6));
      } else if (bestAir) {
        gx = bestAir.x;
        gy = Math.min(GH - 110, Math.max(bestAir.y + 200, GH - 260));
      }
      // nearby pickups are attractive
      var pk = w.pickups.items;
      for (var j = 0; j < pk.length; j++) {
        var q = pk[j];
        var ddx = q.x - p.x,
          ddy = q.y - p.y;
        if (ddx * ddx + ddy * ddy < 170 * 170 && q.y > GH * 0.35) {
          gx = q.x;
          gy = q.y;
          break;
        }
      }
      return [clampX(gx), clampY(gy)];
    }

    function wantBomb(p) {
      if (p.bombs <= 0) return false;
      var en = w.enemies;
      var sc = w.scrollSpeed;
      var ty = Math.max(70, p.y - 220);
      for (var i = 0; i < en.length; i++) {
        var e = en[i];
        if (!e.alive || e.def.layer !== "ground" || e.def.vulnerableTo === "air" || e.invuln || e.def.destructible === false) continue;
        var landY = e.y + sc * 0.6;
        if (Math.abs(e.x - p.x) < 34 + (e.hw || 0) * 0.5 && Math.abs(landY - ty) < 40 + (e.hh || 0) * 0.5) return true;
      }
      return false;
    }

    function missileLocked(p) {
      var eb = w.eBullets.items;
      for (var i = 0; i < eb.length; i++) {
        var b = eb[i];
        if (!b.isMissile) continue;
        var dx = b.x - p.x,
          dy = b.y - p.y;
        if ((b.locked || b.motion === "homing") && dx * dx + dy * dy < 200 * 200) return true;
      }
      return false;
    }

    // ---------------------------------------------------------------- the pilot
    var stepN = 0;
    var lastBombState = false;
    var lastBombPressStep = -999;
    var lastZeroT = -9;
    var NEUTRAL = { moveX: 0, moveY: 0, fire: false, bomb: false, special: false, bombPressed: false, specialPressed: false, weaponPrev: false, weaponNext: false, groundNext: false, pausePressed: false, dragTarget: null };

    function trackMissiles() {
      var eb = w.eBullets.items;
      for (var i = 0; i < eb.length; i++) {
        var b = eb[i];
        if (!b.isMissile) continue;
        var key = b.id + ":" + b.ownerId;
        var kind = defOf(b.ownerId);
        var rec = L.missiles.kinds[kind] || (L.missiles.kinds[kind] = { n: 0, maxSpeed: 0, turnRate: 0, life: 0, decoyable: true });
        if (!seenMissile.has(key)) {
          seenMissile.add(key);
          rec.n++;
        }
        var s = Math.hypot(b.vx || 0, b.vy || 0);
        if (s > rec.maxSpeed) rec.maxSpeed = Math.round(s);
        if (b.turnRate > rec.turnRate) rec.turnRate = b.turnRate;
        if (b.life > rec.life) rec.life = +b.life.toFixed(2);
        if (!b.decoyable) rec.decoyable = false;
        if (s > L.missiles.maxSpeed) L.missiles.maxSpeed = Math.round(s);
      }
      if (seenMissile.size > 4000) seenMissile.clear();
    }

    // "human" profile: re-plans movement only every `replan` steps (reaction time), keeps the old heading in between
    var replan = Math.max(1, opts.replan | 0 || 1);
    // "novice" profile: short sight (perception radius + look-ahead), slower reactions, no panic flares, aim noise
    var novice = !!opts.novice;
    if (novice) {
      TIMES = [0.08, 0.16, 0.25];
      PERCEIVE = 150;
    }
    var held = null;
    function bot() {
      var out = botFull();
      if (replan > 1 && out !== NEUTRAL) {
        if (held && stepN % replan !== 0) {
          out.moveX = held[0];
          out.moveY = held[1];
          if (out.specialPressed && stepN % replan !== 0) {
            out.special = out.specialPressed = false;
          }
        } else held = [out.moveX, out.moveY];
      }
      return out;
    }
    function botFull() {
      stepN++;
      var p = w.player;
      if (w.state !== "playing" || !p.alive) return NEUTRAL;
      if (w.time > maxSimSec) return NEUTRAL;
      var nb = w.eBullets.items.length;
      if (nb > L.maxBullets) {
        L.maxBullets = nb;
        L.maxBulletsT = +w.time.toFixed(1);
      }
      L.bulletSum += nb;
      L.bulletSamples++;
      var near = gatherThreats(p);
      if ((stepN & 7) === 0) trackMissiles();

      // nearest projectile threat for damage attribution
      var bestD = 1e9;
      for (var i = 0; i < threats.length; i++) {
        var th = threats[i];
        if (th.body) continue;
        var dx = th.x + th.vx * SIM_DT - p.x,
          dy = th.y + th.vy * SIM_DT - p.y;
        var d = dx * dx + dy * dy - th.r * th.r;
        if (d < bestD) {
          bestD = d;
          lastThreat.owner = th.hz ? "hazard:" + (L.bossId || "?") : defOf(th.owner);
          lastThreat.kind = th.missile ? "missile" : th.hz ? "hazard" : "bullet";
        }
      }

      // evaluate candidates
      var goal = pickGoal(p);
      var best = null,
        bestScore = 1e18,
        safe = 0;
      var results = [];
      for (var c = 0; c < CANDS.length; c++) {
        var r = evalCand(p, CANDS[c]);
        results.push(r);
        if (r[0] < 0 || r[0] > HARD_T) safe++;
      }
      var dangerW = godRun ? 0.05 : opts.noDodge ? 0 : 1;
      for (var c2 = 0; c2 < CANDS.length; c2++) {
        var rr = results[c2];
        // absolute units (not /GW) so goal pull is equally strong on the 1520-wide playfield
        var gd = Math.hypot((rr[2] - goal[0]) / 480, (rr[3] - goal[1]) / GH);
        var score = rr[1] * dangerW + gd * 6 + (CANDS[c2][0] === 0 && CANDS[c2][1] === 0 ? 0 : 0.01);
        if (score < bestScore) {
          bestScore = score;
          best = CANDS[c2];
        }
      }
      var safeFrac = safe / CANDS.length;
      if (p.invuln <= 0 && !godRun) {
        L.escape.samples++;
        if (safeFrac === 0) {
          L.escape.zero++;
          if (w.time - lastZeroT > 1) {
            var owners = {};
            for (var q = 0; q < threats.length; q++) {
              var tq = threats[q];
              var ddx = tq.x - p.x,
                ddy = tq.y - p.y;
              if (ddx * ddx + ddy * ddy < 140 * 140) {
                var o = tq.hz ? "hazard" : tq.body ? "body:" + defOf(tq.owner) : defOf(tq.owner);
                owners[o] = (owners[o] || 0) + 1;
              }
            }
            if (L.escape.zeroEvents.length < 200) L.escape.zeroEvents.push({ t: +w.time.toFixed(2), px: Math.round(p.x), py: Math.round(p.y), near: near, owners: owners, boss: !!w.boss });
          }
          lastZeroT = w.time;
        } else if (safeFrac < 0.1) L.escape.low++;
      }
      escapeHist.push([w.time, safeFrac]);
      if (escapeHist.length > 90) escapeHist.shift();

      // ordnance + flares
      var bomb = wantBomb(p);
      // Ordnance fires once per press (round 3: holding never repeats), so re-tap every ~0.33 s while a target
      // stays under the drop point, the way a player taps the button; a single held edge would bomb only once.
      var bombPressed = bomb && (!lastBombState || stepN - lastBombPressStep >= 20);
      if (bombPressed) lastBombPressStep = stepN;
      lastBombState = bomb;
      if (bombPressed) L.bombsPressed++;
      var special = false;
      if (p.flareCd <= 0 && p.invuln <= 0 && !godRun) {
        if (missileLocked(p)) special = true;
        else if (!novice) {
          // panic button: best move still collides within 0.16 s
          var br = results[CANDS.indexOf(best)];
          if (br[0] >= 0 && br[0] <= 0.16) special = true;
        }
      }
      return {
        moveX: best[0],
        moveY: best[1],
        fire: true,
        bomb: bomb,
        special: special,
        bombPressed: bombPressed,
        specialPressed: special,
        weaponPrev: false,
        weaponNext: false,
        groundNext: false,
        pausePressed: false,
        dragTarget: null,
      };
    }

    input.poll = bot;

    // hint log
    var lastHint = null;
    function trackHint() {
      var h = null;
      try {
        h = w.runner.hint;
      } catch (e) {}
      if (h !== lastHint) {
        L.hints.push({ t: +w.time.toFixed(1), hint: h });
        lastHint = h;
      }
    }

    // turbo + per-frame bookkeeping
    k.onUpdate(function () {
      trackHint();
      if (turbo > 1) {
        for (var i = 1; i < turbo; i++) {
          if (w.state !== "playing" && w.state !== "complete" && w.state !== "failed") break;
          if (w.time > maxSimSec) break;
          w.step(SIM_DT, bot());
        }
      }
      if (w.time > maxSimSec && !L.outcome) {
        L.outcome = "timeout";
        L.endT = w.time;
      }
    });

    // FPS (rAF based, real frames)
    var last = performance.now();
    var secStart = last,
      secFrames = 0;
    function raf(t) {
      var dt = t - last;
      last = t;
      if (L.fps.frames > 30 && dt > L.fps.worstMs) L.fps.worstMs = Math.round(dt);
      L.fps.frames++;
      secFrames++;
      if (t - secStart >= 1000) {
        L.fps.secs.push(Math.round((secFrames * 1000) / (t - secStart)));
        secFrames = 0;
        secStart = t;
      }
      if (!L.stopFps) requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return true;
  };
})();
