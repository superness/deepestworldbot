let showComputerVision = dw.get("showComputerVision") ?? true
dw.set("showComputerVision", showComputerVision)
let optimalMonsterRange = dw.c.skills.filter((s) => s).shift().range
let optimalMonsterRangeBuffer = 0
let gridUpdatePeriod = 7
let gridWidth = 24
let gridHeight = 16
let gridArrWidth = gridWidth * 3
let gridArrHeight = gridHeight * 3
let scaryMonsterRadius = 4.25
let terrainThickness = 0.45
let entityThickness = 0.5
let targetZoneLevel = dw.c.level
let nearMonsterUnsafeRadius = 2

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function sqr(x) {
    return x * x
}
function dist2(v, w) {
    return sqr(v.x - w.x) + sqr(v.y - w.y)
}
function distToSegmentSquared(p, v, w) {
    let l2 = dist2(v, w)
    if (l2 == 0)
        return dist2(p, v)
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
    t = Math.max(0, Math.min(1, t))
    return dist2(p, {
        x: v.x + t * (w.x - v.x),
        y: v.y + t * (w.y - v.y)
    })
}
function distToSegment(p, v, w) {
    return Math.sqrt(distToSegmentSquared(p, v, w))
}
function hasLineOfSight(target, from = dw.character, nonTraversableEntities = []) {
    if (!target)
        return false
    if (dw.getTerrainAt({ l: dw.c.l, x: target.x, y: target.y }) > 0) {
        return false
    }
    for (let e of nonTraversableEntities) {
        if ("id" in e && "id" in target && e.id === target.id)
            continue
        let thickCheck = terrainThickness
        if (e.id)
            thickCheck = entityThickness
        if (dw.distance(e, from) < thickCheck) {
            let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)
            let vecToEntity = { x: e.x - from.x, y: e.y - from.y }
            let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
            let sameDir = dot([vecToEntity.x, vecToEntity.y], [vecToSpot.x, vecToSpot.y]) < 0
            if (sameDir)
                continue
        }
        if (distToSegment(e, from, target) < thickCheck) {
            return false
        }
    }
    return true
}
function hasLineOfSafety(target, from = dw.character, dangerousEnemyPredicate = e => e.bad && e.id != dw.targetId) {
    if (!target)
        return false
    let hostlies = dw.findEntities(dangerousEnemyPredicate)
    let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)
    for (let monster of hostlies) {
        if (dw.targetId == monster.id)
            continue
        if (dw.distance(monster, dw.c) <= scaryMonsterRadius) {
            let vecToMonster = { x: monster.x - from.x, y: monster.y - from.y }
            let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
            let sameDir = dot([vecToMonster.x, vecToMonster.y], [vecToSpot.x, vecToSpot.y]) < 0
            if (sameDir)
                continue
        }
        let distToTarget = distToSegment(monster, from, target)
        if (distToTarget < scaryMonsterRadius) {
            return false
        }
    }
    return true
}
function getNonTraversableEntities() {
    let nonTraversableEntities = []
    let blockingEntities = dw.findEntities((e) => !e.ai && !e.player && !e.ore && !e.md.includes("portal"))
    let count = blockingEntities.length
    for (let i = 0; i < count; ++i) {
        let e = blockingEntities[i]
        let hitbox = dw.md.items[e.md].hitbox ?? { w: 0, h: 0 }
        nonTraversableEntities.push({ x: e.x - hitbox.w / 2, y: e.y - hitbox.h, id: e.id })
        nonTraversableEntities.push({ x: e.x - hitbox.w / 2, y: e.y - hitbox.h / 2, id: e.id })
        nonTraversableEntities.push({ x: e.x, y: e.y - hitbox.h, id: e.id })
        nonTraversableEntities.push({ x: e.x, y: e.y - hitbox.h / 2, id: e.id })
    }
    let chunkPropertyKeys = Object.keys(dw.chunks).filter((k) => k.startsWith(dw.c.l))
    for (let k of chunkPropertyKeys) {
        let l = k.split(".")[0] - 1
        let r = k.split(".")[2]
        let c = k.split(".")[1]
        let oneBelow = `${l}.${c}.${r}`
        for (let i = 0; i < 16; ++i) {
            for (let j = 0; j < 16; ++j) {
                let isHole = dw.chunks[oneBelow] && dw.chunks[oneBelow][0][i][j] == 0
                if (dw.chunks[k][0][i][j] != 0 || isHole) {
                    let x = r * 16 + j
                    let y = c * 16 + i - (isHole ? 1 : 0)
                    if (x < dw.c.x - gridWidth / 2 || x > dw.c.x + gridWidth / 2 || y < dw.c.y - gridHeight / 2 || y > dw.c.y + gridHeight / 2) {
                        continue
                    }
                    nonTraversableEntities.push({ x: x + 0.5, y: y + 0.5 })
                    nonTraversableEntities.push({ x: x + terrainThickness / 2, y: y + terrainThickness / 2 })
                    nonTraversableEntities.push({ x: x + 1 - terrainThickness / 2, y: y + terrainThickness / 2 })
                    nonTraversableEntities.push({ x: x + terrainThickness / 2, y: y + 1 - terrainThickness / 2 })
                    nonTraversableEntities.push({ x: x + 1 - terrainThickness / 2, y: y + 1 - terrainThickness / 2 })
                }
            }
        }
    }
    return nonTraversableEntities
}

let visionGrid = new Array(gridArrWidth)
let gridLeft = dw.c.x - gridWidth / 2
let gridTop = dw.c.y - gridHeight / 2
let squareWidth = gridWidth / gridArrWidth
let squareHeight = gridHeight / gridArrHeight
squareWidth = gridWidth / gridArrWidth
squareHeight = gridHeight / gridArrHeight
for (let i = 0; i < visionGrid.length; ++i) {
    visionGrid[i] = new Array(gridArrHeight)
    for (let j = 0; j < visionGrid[i].length; ++j) {
        let x = gridLeft + i * squareWidth - squareWidth / 2
        let y = gridTop + j * squareHeight - squareHeight / 2
        visionGrid[i][j] = { x, y, threat: 555, type: "dangerous", lastUpdate: new Date() }
    }
}


const workerCode = `
    function Stopwatch() {
        let sw = this
        let start = null
        let stop = null
        let isRunning = false
        sw.__defineGetter__("ElapsedMilliseconds", function () {
            return (isRunning ? new Date() : stop) - start
        })
        sw.__defineGetter__("IsRunning", function () {
            return isRunning
        })
        sw.Start = function () {
            if (isRunning)
                return
            start = new Date()
            stop = null
            isRunning = true
        }
        sw.Stop = function () {
            if (!isRunning)
                return
            stop = new Date()
            isRunning = false
        }
        sw.Reset = function () {
            start = isRunning ? new Date() : null
            stop = null
        }
        sw.Restart = function () {
            isRunning = true
            sw.Reset()
        }
    }

    // Skill and damage calcuation
    function getBestSkill(targetDistance, c) {
        let bestSkill = null
        let mostDamage = 0
        for (let skill of c.skills) {
            if (skill.range < targetDistance) {
                continue
            }
            let skillDamage = getSkillDamage(skill)
            if (mostDamage < skillDamage) {
                mostDamage = skillDamage
                bestSkill = skill
            }
        }
        return bestSkill
    }
    
    let healingRuneParts = ['heal', 'lifeshield']
    
    function getSkillDamage(skill) {
        if (!skill)
            return 0
        if(healingRuneParts.filter(p => skill.md.toLowerCase().includes(p)).length > 0)
            return 0
        let skillDmg = skill.acid + skill.cold + skill.fire + skill.elec + skill.phys
        return (skillDmg ?? 0) * (skill.fx.mpToHpCost == 1 ? 0.5 : 1)
    }    
    
    let eleNameTypes = ["fire", "elec", "cold", "acid", "elemental"]
    let eleNameTypesRegex = new RegExp(eleNameTypes.join("|"), "i")
    function getMonsterBattleScore(monster, c, useFullHp = false) {
        // Without a better damage calculation method let's give elemental monsters a scarier battle score
        // assuming we are going to be weaker against ele dmg than phys
        let isEle = eleNameTypesRegex.test(monster.md) || monster.terrain != 1
    
        let hpUse = useFullHp ? monster.hpMax : monster.hp
        
        return hpUse * getMonsterDmg(monster) * (isEle ? 1.6 : 1) * (monster.md.toLowerCase().includes('alarm') ? 10 : 1) * (monster.md.toLowerCase().includes('spiked') ? 1.3 : 1)
    }
    
    function getMonsterDmg(monster) {
        let dmg = 19 * Math.pow(1.1, monster.level)
        if (monster.r ?? 0 > 1) {
            dmg *= 1 + monster.r * 0.5
        }
        return dmg
    }
    
    function getMyDmg(c) {
        let mySkillInfo = getBestSkill(0, c) ?? c.skills.filter((s) => s.md).shift()
        return getSkillDamage(mySkillInfo)
    }
    
    function getMaxDamageDealtBeforeOom(monsters, c) {
        let target = monsters.filter((entity) => entity.id === targetId).shift()
    
        let myBestSkill = target ? getBestSkill(distance(target, c),c ) : getBestSkill(0, c)
        let mySkillInfo = myBestSkill ?? getBestSkill(0, c)

        if(!mySkillInfo) return 1
    
        if (c.mpRegen > mySkillInfo.cost) return Number.MAX_SAFE_INTEGER
    
        if(c.mp < mySkillInfo.cost) return 0
    
        let timeToOom = c.mp / (mySkillInfo.cost - c.mpRegen)
        let myDmg = getMyDmg(c)
    
        let maxPossibleDmg = timeToOom * myDmg
        return maxPossibleDmg
    }
    
    function getMyBattleScore(monsters, c, useMaxHp = false) {
        let hpScorePart = (useMaxHp ? c.hpMax : c.hp)
    
        let potentialScore = getMyDmg(c) * hpScorePart
        let maxTargetLife = getMaxDamageDealtBeforeOom(monsters, c)
        let maxDmgScore = maxTargetLife * (getMyDmg(c))
        let dmgScorePart = Math.min(maxDmgScore, potentialScore)
        let battleScore = dmgScorePart

        if(isNaN(battleScore)) battleScore = 0
    
        return battleScore * (getBestSkill(0, c)?.fx.bomb ? 0.6 : 1) 
    }

    function getMpRequiredToDefeatMonster(monster, c) {
        let mpRequired = (monster.hp / getMyDmg(c)) * ((getBestSkill(0, c)?.cost ?? 0) - c.mpRegen)
        return mpRequired
    }

    function getMonstersTargettingMeBattleScore(c, monsters) {
        let monstersTargettingMe = monsters.filter(e => e.targetId && e.targetId == c.id)
        
        let monstersTargettingMeBattleScore = 0
        if(monstersTargettingMe.length > 0) {
            monstersTargettingMeBattleScore = monstersTargettingMe.map(e => getMonsterBattleScore(e)).reduce((accumulator, currentValue) => accumulator + currentValue, monstersTargettingMeBattleScore)
        }
    
        return monstersTargettingMeBattleScore
    }    

    function isValidTarget(entity, nonTraversableEntities, c, monsters, targetZoneLevel, nearMonsterUnsafeRadius ) {
        if (entity.targetId == c.id)
            return true
        if (!hasLineOfSight(entity, c, nonTraversableEntities))
        {
            return false
        }

        if (entity.level < targetZoneLevel - 2 && entity.r === 0 && !entity.bad)
        {
            return false
        }
        
        if(c.hp < (c.hpMax * 0.9) && !c.combat)
        { 
            return false
        }

        let monsterBattleScore = getMonsterBattleScore(entity, c)
        let myBattleScore = getMyBattleScore(monsters, c)
        let monstersTargettingMeBattleScore = getMonstersTargettingMeBattleScore(c, monsters)
        if ((monsterBattleScore + monstersTargettingMeBattleScore) > myBattleScore)
        {
            return false
        }
        let mpRequired = getMpRequiredToDefeatMonster(entity, c)
        if (c.mp < mpRequired)
        {
            return false
        }
        monsters = monsters.filter((e) => e.ai && e.id != entity.id)
        for (let monster of monsters) {
            if (distance(monster, entity) < nearMonsterUnsafeRadius) {
                return false
            }
        }
        return true
    }
    

    let gridWidth = 24
    let gridHeight = 16
    let gridArrWidth = gridWidth * 3
    let gridArrHeight = gridHeight * 3
    let scaryMonsterRadius = 4.25
    let terrainThickness = 0.4
    let entityThickness = 0.4

    function sqr(x) {
        return x * x
    }
    function dist2(v, w) {
        return sqr(v.x - w.x) + sqr(v.y - w.y)
    }
    function distToSegmentSquared(p, v, w) {
        let l2 = dist2(v, w)
        if (l2 == 0)
            return dist2(p, v)
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
        t = Math.max(0, Math.min(1, t))
        return dist2(p, {
            x: v.x + t * (w.x - v.x),
            y: v.y + t * (w.y - v.y)
        })
    }
    function distToSegment(p, v, w) {
        return Math.sqrt(distToSegmentSquared(p, v, w))
    }
    function hasLineOfSight(target, from, nonTraversableEntities = []) {
        if (!target)
            return false
        
        for (let e of nonTraversableEntities) {
            if ("id" in e && "id" in target && e.id === target.id)
                continue
            let thickCheck = terrainThickness
            if (e.id)
                thickCheck = entityThickness
            if (distance(e, from) < thickCheck) {
                let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)
                let vecToEntity = { x: e.x - from.x, y: e.y - from.y }
                let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
                let sameDir = dot([vecToEntity.x, vecToEntity.y], [vecToSpot.x, vecToSpot.y]) < 0
                if (sameDir)
                    continue
            }
            if (distToSegment(e, from, target) < thickCheck) {
                return false
            }
        }
        return true
    }

    let targetId = 0
    function hasLineOfSafety(target, from, monsters, c, dangerousEnemyPredicate = e => e.bad && e.id != targetId) {
        if (!target)
            return false
        let hostlies = monsters.filter(dangerousEnemyPredicate)
        let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)
        for (let monster of hostlies) {
            if (targetId == monster.id)
                continue
            if (distance(monster, c) <= scaryMonsterRadius) {
                let vecToMonster = { x: monster.x - from.x, y: monster.y - from.y }
                let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
                let sameDir = dot([vecToMonster.x, vecToMonster.y], [vecToSpot.x, vecToSpot.y]) < 0
                if (sameDir)
                    continue
            }
            let monsterTest = { x: monster.x, y: monster.y }
            let distToTarget = distToSegment(monster, from, target)
            if (distToTarget < scaryMonsterRadius) {
                return false
            }
        }
        return true
    }
    function getSpotInfo(x, y, monsters, nonTraversableEntities, c, optimalMonsterRange, optimalMonsterRangeBuffer, targetZoneLevel, targetId, nearMonsterUnsafeRadius) {
        let nearMonsters = monsters.filter((m) => distance({ x, y }, m))
        let target = monsters.filter((entity) => entity.id === targetId).shift()
        let spotValue = 50
        let spotType = "open"
        if (!hasLineOfSight({ x, y }, c, nonTraversableEntities)) {
            spotValue = 555
            spotType = "obstructed"
        }
        if (!hasLineOfSafety({ x, y }, c, monsters, c)) {
            spotValue = 555
            spotType = "dangerous"
        }
        if (spotType != "obstructed" && spotType != "dangerous") {
            for (let monster of nearMonsters) {
                let monsterTest = { x: monster.x, y: monster.y }
                let dist = Math.max(distance({ x, y }, monster))
                
                if (dist < optimalMonsterRange + optimalMonsterRangeBuffer && isValidTarget(monster, nonTraversableEntities, c, monsters, targetZoneLevel, nearMonsterUnsafeRadius)) {
                    let delta = 0
                    if (dist < optimalMonsterRange - 0.25 + optimalMonsterRangeBuffer && optimalMonsterRange + optimalMonsterRangeBuffer > optimalMonsterRange - 0.25) {
                        delta += 80 * (1 - dist / (optimalMonsterRange + optimalMonsterRangeBuffer))
                        if (spotType == "open") {
                            spotType = "fallback"
                        }
                    } else if (dist < optimalMonsterRange + optimalMonsterRangeBuffer) {
                        delta -= 40
                        if (spotType == "open") {
                            spotType = "preference"
                        }
                    } else if (dist < optimalMonsterRange + optimalMonsterRangeBuffer + 0.5) {
                        delta += 50
                        if (spotType == "open") {
                            spotType = "fallback"
                        }
                    }
                    if (!hasLineOfSight({ x, y }, monsterTest, nonTraversableEntities)) {
                        delta += 100
                        spotType = "partially-obstructed"
                    }
                    spotValue += delta
                } else {
                    let targetGooOtherGooCombat = target && target.md.toLowerCase().includes("goo") && monster.md.toLowerCase().includes("goo") && (c.combat == 1)
                    let doAvoid = monster.bad || targetGooOtherGooCombat
                    let prevScaryRadius = scaryMonsterRadius
                    if (targetGooOtherGooCombat && !monster.bad) {
                        scaryMonsterRadius = 3
                    }
                    if (!hasLineOfSafety({x:x, y:y}, c, monsters, c, e => e.id == monster.id) && doAvoid && hasLineOfSight({ x:x, y:y }, monster, nonTraversableEntities)) {
                        spotValue += 500
                        spotType = "dangerous"
                    }
                    scaryMonsterRadius = prevScaryRadius
                }
            }
        }
        return { positionValue: spotValue, type: spotType, lastUpdate: new Date() }
    }
        
    function distance(a, b)
    {
        var distance = Math.sqrt((Math.pow(a.x-b.x,2))+(Math.pow(a.y-b.y,2)))
        return distance;
    };

    let visionGrid = new Array(gridArrWidth)
    let gridLeft = 0 - gridWidth / 2
    let gridTop = 0 - gridHeight / 2
    let squareWidth = gridWidth / gridArrWidth
    let squareHeight = gridHeight / gridArrHeight
    squareWidth = gridWidth / gridArrWidth
    squareHeight = gridHeight / gridArrHeight
    for (let i = 0; i < visionGrid.length; ++i) {
        visionGrid[i] = new Array(gridArrHeight)
        for (let j = 0; j < visionGrid[i].length; ++j) {
            let x = gridLeft + i * squareWidth - squareWidth / 2
            let y = gridTop + j * squareHeight - squareHeight / 2
            visionGrid[i][j] = { x, y, threat: 555, type: "dangerous", lastUpdate: new Date() }
        }
    }

    let fullGridProcessed = false;
    self.addEventListener('message', function(e) {
        // Add the functions and variables needed here like yieldVisionGridUpdatesOnOldSpots
        // and Stopwatch definition...
        gridLeft = e.data.c.x - gridWidth / 2
        gridTop = e.data.c.y - gridHeight / 2
        
        targetId = e.data.targetId

        function* yieldVisionGridUpdatesOnOldSpots() {
            while (true) {
                let visionGridEx = []
                for (let i = 0; i < gridArrWidth; ++i) {
                    for (let j = 0; j < gridArrHeight; ++j) {
                        let distPlayer = distance(visionGrid[i][j], e.data.c)
                        let distUse = distPlayer
                        distUse /= 16
                        distUse += visionGrid[i][j].threat / 555
                        visionGridEx.push({ i, j, data: visionGrid[i][j], dist: distUse })
                    }
                }
                let now = new Date()
                visionGridEx.sort((a, b) => (now.getTime() - b.data.lastUpdate.getTime()) / b.dist - (now.getTime() - a.data.lastUpdate.getTime()) / a.dist)
                for (let spot of visionGridEx) {
                    now = new Date()
                    let gridLeft2 = e.data.c.x - gridWidth / 2
                    let gridTop2 = e.data.c.y - gridHeight / 2
                    let squareWidth2 = gridWidth / gridArrWidth
                    let squareHeight2 = gridHeight / gridArrHeight
                    squareWidth2 = gridWidth / gridArrWidth
                    squareHeight2 = gridHeight / gridArrHeight
                    let x = gridLeft2 + spot.i * squareWidth2 - squareWidth2 / 2
                    let y = gridTop2 + spot.j * squareHeight2 - squareHeight2 / 2
                    let spotInfo = getSpotInfo(x, y, e.data.monsters, e.data.nonTraversableEntities, e.data.c, e.data.optimalMonsterRange, e.data.optimalMonsterRangeBuffer, e.data.targetZoneLevel, targetId, e.data.nearMonsterUnsafeRadius)
                    visionGrid[spot.i][spot.j] = { x:x, y:y, threat: spotInfo.positionValue, type: spotInfo.type, lastUpdate: new Date() }
                    yield { i: spot.i, j: spot.j, data: { x:x, y:y, threat: spotInfo.positionValue, type: spotInfo.type, lastUpdate: new Date() } }
                }
                fullGridProcessed = true
            }
        }


        let sw = new Stopwatch();
        sw.Start();
        let visionGridUpdateYielderOld = yieldVisionGridUpdatesOnOldSpots();
        fullGridProcessed = false;
        let updates = [];
        while (sw.ElapsedMilliseconds < e.data.gridUpdatePeriod && !fullGridProcessed) {
            let visionGridUpdate = visionGridUpdateYielderOld.next().value;
            let gridLeft2 = e.data.c.x - e.data.gridWidth / 2;
            let gridTop2 = e.data.c.y - e.data.gridHeight / 2;
            let squareWidth2 = e.data.gridWidth / e.data.gridArrWidth;
            let squareHeight2 = e.data.gridHeight / e.data.gridArrHeight;
            let x = gridLeft2 + visionGridUpdate.i * squareWidth2 - squareWidth2 / 2;
            let y = gridTop2 + visionGridUpdate.j * squareHeight2 - squareHeight2 / 2;
            updates.push({ i: visionGridUpdate.i, j: visionGridUpdate.j, x, y, threat: visionGridUpdate.data.threat, type: visionGridUpdate.data.type, lastUpdate: new Date() });
        }
        self.postMessage(updates);
    }, false);
`;

const blob = new Blob([workerCode], { type: 'application/javascript' });
const visionGridWorker = new Worker(URL.createObjectURL(blob));

async function updateVisionGridOld() {
    visionGridWorker.postMessage({
        gridUpdatePeriod: gridUpdatePeriod,
        monsters: dw.findEntities((e) => e.ai),
        nonTraversableEntities: getNonTraversableEntities(),
        c: {x:dw.c.x, y:dw.c.y, skills:dw.c.skills, hp:dw.c.hp, hpMax:dw.c.hpMax, mp:dw.c.mp, mpRegen:dw.c.mpRegen, combat:dw.c.combat},
        gridWidth: gridWidth,
        gridHeight: gridHeight,
        gridArrWidth: gridArrWidth,
        gridArrHeight: gridArrHeight,
        targetId: dw.targetId,
        optimalMonsterRange:optimalMonsterRange,
        optimalMonsterRangeBuffer:optimalMonsterRangeBuffer,
        targetZoneLevel: targetZoneLevel,
        nearMonsterUnsafeRadius: nearMonsterUnsafeRadius
    });

    let sleepTime = Math.max(1, gridUpdatePeriod - (new Stopwatch()).ElapsedMilliseconds);
    sleepTime = Math.max(33 - (new Stopwatch()).ElapsedMilliseconds, sleepTime);
    await sleep(sleepTime);
    updateVisionGridOld()
}

visionGridWorker.addEventListener('message', function(e) {
  e.data.forEach(update => {
    visionGrid[update.i][update.j] = { x: update.x, y: update.y, threat: update.threat, type: update.type, lastUpdate: update.lastUpdate };
  });
}, false);

setTimeout(updateVisionGridOld, 100);


let floatingText = []
dw.on("hit", (data) => {
    for (let hit of data) {
        if (!hit.amount)
            continue

        let target = dw.findEntities((entity) => entity.id === hit.target).shift()

        let newText = { text: hit.amount, x: target.x, y: target.y, target: hit.target, life: 1.3, maxLife: 1.3 }
        if (target.id == dw.c.id) {
            newText.x -= 1
            newText.y -= 1
        }
        floatingText.push(newText)
        if (hit.rip && hit.target == dw.c.id) {
            moveToSpot = dw.c.spawn
        } else if (hit.rip) {
            if (hit.target in entititiesSmoothPosMap) {
                delete entititiesSmoothPosMap[hit.target]
            }
        }
    }
})

// Manage the zone the bot moves toward
let lastCombat = new Date()
setInterval(function () {
    let now = new Date()

    if (dw.c.combat) {
        lastCombat = new Date()
        return
    }

    if ((now.getTime() - lastCombat.getTime()) > 1000 * 30) {
        targetZoneLevel = Math.max(1, targetZoneLevel - 1)
        lastCombat = new Date()
        dw.log(`Reducing target zone level to '${targetZoneLevel}' because of stale combat`)
    }
}, 1000)

dw.on("hit", (data) => {
    for (let hit of data) {
        if (!hit.amount)
            continue

        let target = dw.findEntities((entity) => entity.id === hit.target).shift()

        if (hit.rip) {
            if (hit.actor == dw.c.id) {
                if (dw.c.hp / dw.c.hpMax > 0.5) {
                    if (target.level >= targetZoneLevel) {
                        targetZoneLevel++
                        dw.log(`changing target zone level up to ${targetZoneLevel}`)
                    }
                }
                if (dw.c.hp / dw.c.hpMax < 0.25) {
                    targetZoneLevel--
                    targetZoneLevel = Math.max(1, targetZoneLevel)
                    dw.log(`changing target zone level down to ${targetZoneLevel}`)
                }
            }
        }
    }
})

function getMpRequiredToDefeatMonster(monster) {
    let mpRequired = (monster.hp / getMyDmg()) * ((getBestSkill(0)?.cost ?? 0) - dw.c.mpRegen)
    return mpRequired
}

// This keeps the character from pulling until it has enough mp to win the fight
setInterval(function () {
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    if (!target) {
        optimalMonsterRangeBuffer = 0
        return
    }
    
    if(dw.c.combat) {
        optimalMonsterRangeBuffer = 0
        return
    }

    let mpRequired = getMpRequiredToDefeatMonster(target)
    if (dw.c.mp < mpRequired)
        optimalMonsterRangeBuffer = 1
    else if((dw.c.hp < dw.c.hpMax * 0.8) && dw.c.combat != 1)
        optimalMonsterRangeBuffer = 1
    else
        optimalMonsterRangeBuffer = 0
}, 100)

function getMonstersTargettingMeBattleScore() {
    let monstersTargettingMe = dw.findEntities(e => e.targetId && e.targetId == dw.c.id)
    
    let monstersTargettingMeBattleScore = 0
    if(monstersTargettingMe.length > 0) {
        monstersTargettingMeBattleScore = monstersTargettingMe.map(e => getMonsterBattleScore(e)).reduce((accumulator, currentValue) => accumulator + currentValue, monstersTargettingMeBattleScore)
    }

    return monstersTargettingMeBattleScore
}

function isValidTarget(entity, nonTraversableEntities = null) {
    if (entity.targetId == dw.c.id)
        return true
    if (!hasLineOfSight(entity, dw.c, nonTraversableEntities ?? getNonTraversableEntities()))
        return false
    if (entity.level < targetZoneLevel - 2 && entity.r === 0 && !entity.bad)
        return false
    if(dw.c.hp < (dw.c.hpMax * 0.9) && !dw.c.combat)
        return false
    let monsterBattleScore = getMonsterBattleScore(entity)
    let myBattleScore = getMyBattleScore()
    let monstersTargettingMeBattleScore = getMonstersTargettingMeBattleScore()
    if ((monsterBattleScore + monstersTargettingMeBattleScore) > myBattleScore)
        return false
    let mpRequired = getMpRequiredToDefeatMonster(entity)
    if (dw.c.mp < mpRequired)
        return false
    let monsters = dw.findEntities((e) => e.ai && e.id != entity.id)
    for (let monster of monsters) {
        if (dw.distance(monster, entity) < nearMonsterUnsafeRadius) {
            return false
        }
    }
    return true
}

// Skill and damage calcuation
function getBestSkill(targetDistance) {

    let sortedSkills = dw.c.skills.filter(s => s.range >= targetDistance).sort((a,b) => getSkillDamage(a) - getSkillDamage(b))

    if(sortedSkills.length == 0) return null

    let bestSkill = sortedSkills[0]
    bestSkill.skillBagIndex = dw.c.skills.findIndex(s => s == bestSkill)
    return bestSkill
}

let healingRuneParts = ['heal', 'lifeshield']

function getSkillDamage(skill) {
    if (!skill)
        return 0
    if(healingRuneParts.filter(p => skill.md.toLowerCase().includes(p)).length > 0)
        return 0
    let skillDmg = skill.acid + skill.cold + skill.fire + skill.elec + skill.phys
    return (skillDmg ?? 0) * (skill.fx.mpToHpCost == 1 ? 0.5 : 1)
}




let eleNameTypes = ["fire", "elec", "cold", "acid", "elemental"]
let eleNameTypesRegex = new RegExp(eleNameTypes.join("|"), "i")
function getMonsterBattleScore(monster, useFullHp = false) {
    // Without a better damage calculation method let's give elemental monsters a scarier battle score
    // assuming we are going to be weaker against ele dmg than phys
    let isEle = eleNameTypesRegex.test(monster.md) || monster.terrain != 1

    let hpUse = useFullHp ? monster.hpMax : monster.hp

    return hpUse * getMonsterDmg(monster) * (isEle ? 1.6 : 1) * (monster.md.toLowerCase().includes('alarm') ? 10 : 1) * (monster.md.toLowerCase().includes('spiked') ? 1.3 : 1)
}

function getMonsterDmg(monster) {
    let dmg = 19 * Math.pow(1.1, monster.level)
    if (monster.r ?? 0 > 1) {
        dmg *= 1 + monster.r * 0.5
    }
    return dmg
}

function getMyDmg() {
    let mySkillInfo = getBestSkill(0) ?? dw.c.skills.filter((s) => s.md).shift()
    return getSkillDamage(mySkillInfo)
}

function getMaxDamageDealtBeforeOom(useMaxMp = false) {
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()

    let myBestSkill = target ? getBestSkill(dw.distance(target, dw.c)) : getBestSkill(0)
    let mySkillInfo = myBestSkill ?? getBestSkill(0)

    if(!mySkillInfo) return 1

    if (dw.c.mpRegen > mySkillInfo.cost) return Number.MAX_SAFE_INTEGER

    if((useMaxMp ? dw.c.mpMax : dw.c.mp) < mySkillInfo.cost) return 0

    let timeToOom = (useMaxMp ? dw.c.mpMax : dw.c.mp) / (mySkillInfo.cost - dw.c.mpRegen)
    let myDmg = getMyDmg()

    let maxPossibleDmg = timeToOom * myDmg
    return maxPossibleDmg
}

function getMyBattleScore(useMaxHp = false) {
    let hpScorePart = (useMaxHp ? dw.c.hpMax : dw.c.hp)

    let potentialScore = getMyDmg() * hpScorePart
    let maxTargetLife = getMaxDamageDealtBeforeOom()
    let maxDmgScore = maxTargetLife * (getMyDmg())
    let dmgScorePart = Math.min(maxDmgScore, potentialScore)
    let battleScore = dmgScorePart

    if(isNaN(battleScore)) battleScore = 0

    return battleScore * (getBestSkill(0)?.fx.bomb ? 0.6 : 1)
}

function getMyMaximumBattleScore() {
    let potentialScore = (getMyDmg() * dw.c.hpMax)

    if(isNaN(potentialScore)) potentialScore = 0

    let maxTargetLife = getMaxDamageDealtBeforeOom(true)
    let maxDmgScore = maxTargetLife * (getMyDmg())

    let dmgScorePart = Math.min(maxDmgScore, potentialScore)

    if(isNaN(dmgScorePart)) dmgScorePart = 0

    return dmgScorePart * (getBestSkill(0)?.md.startsWith('coldbolt') ? 0.6 : 1)
}

// Pick where to move
let moveUpdatePeriod = 30
let movePeriod = 100
let searchOffset = 2
let searchOffsetMission = 1
let recencyAvoidanceRadius = 3
let recentSpots = []
setInterval(function () {

    let bestSpot = getGoodSpots(15).shift()
    bestSpot = bestSpot ?? getGoodSpots(40).shift()
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    let moveToSpotIsClose = dw.distance(moveToSpot, dw.c) < 0.35 

    let isSpotSafe = hasLineOfSafety(moveToSpot, dw.c)
    let targetIsGoo = target && target.md.toLowerCase().includes("goo") && dw.c.combat

    if(targetIsGoo)
    {
        isSpotSafe = isSpotSafe && hasLineOfSafety(moveToSpot, dw.c, e => e.md.toLowerCase().includes("goo") && e.id != dw.targetId)
    }

    let canSeeSpot = hasLineOfSight(moveToSpot, dw.c, getNonTraversableEntities())
    if (!bestSpot && (moveToSpotIsClose || !isSpotSafe || !canSeeSpot)) {
        let goodSpots = getGoodSpots(50, true)
        let goodSpotsNoAvoidRecent = getGoodSpots(50, false)
        let goodFartherSpots = goodSpots.filter((p) => dw.distance(p, dw.c) > searchOffset)
        let goodFarSpots = goodSpots.filter((p) => dw.distance(p, dw.c) > searchOffsetMission)
        let zoneLevel = dw.getZoneLevel()
        let targetLevel = dw.c.mission ? dw.c.mission.item.qual : targetZoneLevel
        let zoneDiff = zoneLevel - targetLevel
        let goodAltSpots = []
        let goodTertSpots = []
        let distFromSpawn = dw.distance(dw.c, { x: 0, y: 0 })
        if (zoneDiff > 0 && !dw.c.mission) {
            goodAltSpots = goodFarSpots.filter((p) => dw.distance(p, { x: 0, y: 0 }) < distFromSpawn)
        } else if (zoneDiff < 0 && !dw.c.mission) {
            goodAltSpots = goodFarSpots.filter((p) => dw.distance(p, { x: 0, y: 0 }) > distFromSpawn)
        }
        bestSpot = goodTertSpots.shift() ?? goodAltSpots.shift() ?? goodFartherSpots.shift() ?? goodFarSpots.shift() ?? goodSpots.shift() ?? goodSpotsNoAvoidRecent.shift()
        if (dw.c.mission) {
            bestSpot = goodFartherSpots.shift() ?? goodFarSpots.shift() ?? goodSpots.shift() ?? goodSpotsNoAvoidRecent.shift()
        }
    }
    moveToSpot = bestSpot ?? moveToSpot
}, moveUpdatePeriod)

setInterval(function () {
    let inRangeSpots = recentSpots.filter(s => dw.distance(dw.c, s) < recencyAvoidanceRadius)
    if (recentSpots.length == 0 || inRangeSpots.length == 0) {
        let dx = 0
        let dy = 0
        if (recentSpots.length > 0) {
            dx = dw.c.x - recentSpots[recentSpots.length - 1].x
            dy = dw.c.y - recentSpots[recentSpots.length - 1].y
        }
        recentSpots.push({ x: dw.c.x - dx * 4/5, y: dw.c.y - dy * 4/5 })
    }
}, 300)

setInterval(function () {
    if(recentSpots.length > 1) {
        recentSpots.shift()
    }
    while (recentSpots.length > 44) {
        recentSpots.shift()
    }
}, 2500)

function getSpotRecentlyUsed(x, y) {
    for (let recentSpot of recentSpots) {
        let distSpot = dw.distance({ x, y }, recentSpot)
        if (distSpot < recencyAvoidanceRadius) {
            return true
        }
    }
    return false
}
function getGoodSpots(range, avoidRecent = false) {
    let goodSpots = []
    let now = new Date()
    for (let i = 0; i < gridArrWidth; ++i) {
        for (let j = 0; j < gridArrHeight; ++j) {
            if (visionGrid[i][j].threat <= range && (now - visionGrid[i][j].lastUpdate < 300)) {
                if (avoidRecent && getSpotRecentlyUsed(visionGrid[i][j].x, visionGrid[i][j].y))
                    continue
                goodSpots.push(visionGrid[i][j])
            }
        }
    }
    goodSpots.sort(function (a, b) {
        let da = dw.distance(dw.c, a)
        let db = dw.distance(dw.c, b)
        return da - db
    })
    return goodSpots
}

// Emit the move command
let moveToSpot = { x: dw.c.x, y: dw.c.y }
let movingToSpot = { x: dw.c.x, y: dw.c.y }
setInterval(function () {
    if (!moveToSpot)
        return
    if (null == moveToSpot)
        return
    if (dw.get(`${dw.c.name}_manualmove`) === true)
        return
    movingToSpot = movingToSpot ?? moveToSpot
    let dx = moveToSpot.x - movingToSpot.x
    let dy = moveToSpot.y - movingToSpot.y
    movingToSpot.x += dx * 4 / (1e3 / movePeriod)
    movingToSpot.y += dy * 4 / (1e3 / movePeriod)
    let dist = dw.distance(movingToSpot, dw.c)
    if (dist < 0.1)
        return
    dw.emit("move", movingToSpot)
}, movePeriod)

// Attack stuff
setInterval(function () {
    if (dw.get(`${dw.name}_skipAttacks`) == true)
    {
        return
    }

    let monsterTargettingMe = dw.findClosestMonster((e) => e.targetId == dw.c.id)

    let target = dw.findClosestMonster((m) => isValidTarget(m))
    if ((!target || target.hp == target.hpMax) && monsterTargettingMe && target != monsterTargettingMe) {
        target = monsterTargettingMe
        if(!recordThat.getIsRecording())
        {
            recordThat.start()
        }
    }
    if (!target)
    {
        return
    }
       
    dw.setTarget(target.id)
    let distTarget = dw.distance(target, dw.c)
    let skillUse = getBestSkill(distTarget)

    // No good skills to use
    if (!skillUse || skillUse === undefined) {
        return
    }

    optimalMonsterRange = skillUse.range - 0.2

    if(skillUse.fx.blink)
    {
        optimalMonsterRange = Math.max(optimalMonsterRange - 3, 3)
    }

    let isSkillReady = dw.isSkillReady(skillUse.skillBagIndex)
    if (dw.c.mp < (skillUse?.cost ?? 0) || !isSkillReady || dw.distance(target, dw.c) > optimalMonsterRange) {
        return
    }

    if(skillUse.md.toLowerCase().includes('coldbolt'))
    {
        if(target.fx.bomb) return
    }

    if(isSkillReady)
    {
        dw.useSkill(skillUse.skillBagIndex, target.id)
    }
}, 50)


// Entity positions that smoothly transition over time
// used for UI display so that entity updates don't cause the nameplates to jump around
let entititiesSmoothPosMap = {}
setInterval(function () {
    for (let entity of dw.findEntities((e) => e.ai || e.player)) {
        if (!(entity.id in entititiesSmoothPosMap)) {
            entititiesSmoothPosMap[entity.id] = { x: entity.x, y: entity.y }
        }
        let dx = entity.x - entititiesSmoothPosMap[entity.id].x
        let dy = entity.y - entititiesSmoothPosMap[entity.id].y
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            entititiesSmoothPosMap[entity.id].x += dx
            entititiesSmoothPosMap[entity.id].y += dy
        } else {
            entititiesSmoothPosMap[entity.id].x += dx / 10
            entititiesSmoothPosMap[entity.id].y += dy / 10
        }
    }
}, 4)

function Stopwatch() {
    let sw = this
    let start = null
    let stop = null
    let isRunning = false
    sw.__defineGetter__("ElapsedMilliseconds", function () {
        return (isRunning ? new Date() : stop) - start
    })
    sw.__defineGetter__("IsRunning", function () {
        return isRunning
    })
    sw.Start = function () {
        if (isRunning)
            return
        start = new Date()
        stop = null
        isRunning = true
    }
    sw.Stop = function () {
        if (!isRunning)
            return
        stop = new Date()
        isRunning = false
    }
    sw.Reset = function () {
        start = isRunning ? new Date() : null
        stop = null
    }
    sw.Restart = function () {
        isRunning = true
        sw.Reset()
    }
}





let noRender = false




// Visualizations
let gridTypeStyleMap = {
    open: "rgb(0, 100, 255, alpha)",
    obstructed: "rgb(0, 0, 0, alpha)",
    "partially-obstructed": "rgb(33, 33, 33, alpha)",
    preference: "rgb(0, 255, 0, alpha)",
    fallback: "rgb(245, 66, 239, alpha)",
    dangerous: "rgb(207, 0, 41, alpha)",
    "negative-value": "rgb(114, 0, 207, alpha)"
}
function getGridStyle(type, alpha) {
    let styleFormat = gridTypeStyleMap[type]
    if (!styleFormat)
        return "red"
    return styleFormat.replace("alpha", alpha)
}
dw.on("drawEnd", (ctx, cx, cy) => {

    if(noRender) return

    if (!dw.get("showComputerVision")) {
        return
    }
    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))
    let squareWidth2 = gridWidth / gridArrWidth * 96
    let squareHeight2 = gridHeight / gridArrHeight * 96
    ctx.font = "12px arial"
    let now = new Date()
    for (let i = 0; i < gridArrWidth; ++i) {
        for (let j = 0; j < gridArrHeight; ++j) {
            let threatLevel = Math.max(Math.min(visionGrid[i][j].threat, 100), 0)
            let alpha = threatLevel / 100 * 0.3
            ctx.fillStyle = getGridStyle(visionGrid[i][j].type, 1)
            let x = visionGrid[i][j].x * 96 - camOffsetX
            let y = visionGrid[i][j].y * 96 - camOffsetY
            if (x < -1 * squareWidth2 || x > ctx.canvas.width || y < -1 * squareHeight2 || y > ctx.canvas.height)
                continue
            let sizeMulti = Math.max(0, (1e3 - (now - visionGrid[i][j].lastUpdate)) / 1e3)
            let widthUse = squareWidth2 / 2 * sizeMulti
            let heightUse = squareHeight2 / 2 * sizeMulti
            ctx.beginPath()
            ctx.rect(x + (squareWidth2 - widthUse) / 2, y + (squareHeight2 - heightUse) / 2, widthUse, heightUse)
            ctx.fill()
            ctx.fillStyle = `rgb(0, 0, 0, 0.5)`
        }
    }
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    ctx.lineWidth = 4
    if (moveToSpot) {
        drawLineToPOI(ctx, cx, cy, moveToSpot, `rgb(0, 255, 0, 0.9`)
        drawLineToPOI(ctx, cx, cy, movingToSpot, `rgb(231, 0, 255, 0.9)`)
    }
    drawLineToPOI(ctx, cx, cy, target, `rgb(245, 239, 66, 0.9)`, {x:dw.c.x, y:dw.c.y - 0.5})

    let monstersTargettingMe = dw.findEntities(e => e.targetId && e.targetId == dw.c.id)
    for(var monster of monstersTargettingMe) {
        drawLineToPOI(ctx, cx,cy, dw.c, 'white', {x:monster.x, y:monster.y - 0.5})
    }
})
dw.on("drawEnd", (ctx, cx, cy) => {

    if(noRender) return

    ctx.strokeStyle = "green"
    ctx.fillStyle = "white"
    ctx.font = "18px arial"
    let monsters = dw.findEntities((e) => e.ai)
    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))
    let myBattleScore = Math.round(getMyBattleScore(false))
    let nonTraversableEntities = getNonTraversableEntities()
    for (let monster of monsters) {

        let smoothPos = monster.id in entititiesSmoothPosMap ? entititiesSmoothPosMap[monster.id] : monster
        let x2 = smoothPos.x * 96 - camOffsetX
        let y2 = smoothPos.y * 96 - camOffsetY - 60
        
        let squareWidth2 = gridWidth / gridArrWidth * 96
        let squareHeight2 = gridHeight / gridArrHeight * 96
        if (x2 < -1 * squareWidth2 || x2 > ctx.canvas.width || y2 < -1 * squareHeight2 || y2 > ctx.canvas.height)
            continue

        ctx.fillStyle = `rgb(0, 0, 0, 0.5)`
        ctx.beginPath()
        ctx.rect(x2 - 96 / 2, y2, 96, 8)
        ctx.fill()
        ctx.strokeStyle = "black"
        ctx.fillStyle = "red"
        ctx.beginPath()
        ctx.rect(x2 - 96 / 2, y2, 96 * monster.hp / monster.hpMax, 8)
        ctx.fill()
        ctx.fillStyle = `rgb(255, 255, 255, 0.3)`
        ctx.beginPath()
        ctx.rect(x2 - 96 / 2, y2, 96, 4)
        ctx.fill()
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.rect(x2 - 96 / 2, y2, 96, 8)
        ctx.stroke()
        ctx.strokeStyle = "black"
        ctx.fillStyle = "white"
        ctx.lineWidth = 4
        let dmg2 = Math.round(getMonsterDmg(monster))
        let battleScore = Math.round(getMonsterBattleScore(monster))
        let name2 = `\u{1F396}\uFE0F${monster.level} ${monster.md}`
        if (monster.r ?? 0 >= 1) {
            name2 += `\u{1F480}`
            if (monster.r > 1) {
                name2 += monster.r
            }
        }
        ctx.font = "14px arial"
        ctx.textAlign = "center"
        ctx.strokeText("\u{1F5E1}\uFE0F", x2, y2 - 8 - 20)
        ctx.fillText("\u{1F5E1}\uFE0F", x2, y2 - 8 - 20)
        ctx.fillStyle = "orange"
        ctx.textAlign = "right"
        let textWidth2 = ctx.measureText(dmg2).width
        ctx.strokeText(dmg2, x2 - textWidth2, y2 - 8 - 20)
        ctx.fillText(dmg2, x2 - textWidth2, y2 - 8 - 20)
        ctx.fillStyle = "white"
        if (battleScore < myBattleScore * 0.7) {
            ctx.fillStyle = "white"
        } else if (isValidTarget(monster, nonTraversableEntities)) {
            ctx.strokeStyle = "orange"
        } else {
            ctx.strokeStyle = "red"
        }
        ctx.textAlign = "left"
        textWidth2 = ctx.measureText("x").width + 5
        ctx.strokeText(battleScore, x2 + textWidth2, y2 - 8 - 20)
        ctx.fillText(battleScore, x2 + textWidth2, y2 - 8 - 20)
        ctx.font = "18px arial"
        ctx.textAlign = "center"
        ctx.strokeText(name2, x2, y2 - 8)
        ctx.fillText(name2, x2, y2 - 8)
        ctx.lineWidth = 2
        ctx.font = "12px arial"
        ctx.strokeText(monster.hp, x2, y2 + 8)
        ctx.fillText(monster.hp, x2, y2 + 8)
    }
    let otherPlayers = dw.findEntities((e) => e.player && e.id != dw.c.id)
    for (let pc of otherPlayers) {
        let smoothPos = pc.id in entititiesSmoothPosMap ? entititiesSmoothPosMap[pc.id] : pc
        let x2 = smoothPos.x * 96 - camOffsetX
        let y2 = smoothPos.y * 96 - camOffsetY - 120
        let w = 124
        let h = 12
        ctx.fillStyle = `rgb(0, 0, 0, 0.5)`
        ctx.beginPath()
        ctx.rect(x2 - w / 2, y2, w, h)
        ctx.fill()
        ctx.strokeStyle = "black"
        ctx.fillStyle = "blue"
        ctx.beginPath()
        ctx.rect(x2 - w / 2, y2, w * pc.hp / pc.hpMax, h)
        ctx.fill()
        ctx.fillStyle = `rgb(255, 255, 255, 0.3)`
        ctx.beginPath()
        ctx.rect(x2 - w / 2, y2, w, h / 2)
        ctx.fill()
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.rect(x2 - w / 2, y2, w, h)
        ctx.stroke()
        ctx.strokeStyle = "black"
        ctx.fillStyle = "white"
        ctx.lineWidth = 4
        let name2 = `\u{1F396}\uFE0F${pc.level} ${pc.name}`
        ctx.fillStyle = "white"
        ctx.font = "18px arial"
        ctx.textAlign = "center"
        ctx.strokeText(name2, x2, y2 - 8)
        ctx.fillText(name2, x2, y2 - 8)
        ctx.lineWidth = 2
        ctx.font = "12px arial"
        ctx.strokeText(pc.hp, x2, y2 + 8)
        ctx.fillText(pc.hp, x2, y2 + 8)
    }
    let x = ctx.canvas.width / 2
    let y = ctx.canvas.height / 2 - 120
    ctx.fillStyle = `rgb(0, 0, 0, 0.5)`
    let nameplateWidth = 192
    let nameplateHeight = 16
    ctx.beginPath()
    ctx.rect(x - nameplateWidth / 2, y, nameplateWidth, nameplateHeight)
    ctx.fill()
    ctx.strokeStyle = "black"
    ctx.fillStyle = "green"
    if (dw.c.hp / dw.c.hpMax < 0.66) {
        ctx.fillStyle = "orange"
    }
    if (dw.c.hp / dw.c.hpMax < 0.33) {
        ctx.fillStyle = "red"
    }
    ctx.beginPath()
    ctx.rect(x - nameplateWidth / 2, y, nameplateWidth * dw.c.hp / dw.c.hpMax, nameplateHeight)
    ctx.fill()
    ctx.fillStyle = "rgb(0, 0, 255, 0.6"
    ctx.beginPath()
    ctx.rect(x - nameplateWidth / 2, y + 3 * nameplateHeight / 4, nameplateWidth * dw.c.mp / dw.c.mpMax, nameplateHeight / 4)
    ctx.fill()
    ctx.fillStyle = `rgb(255, 255, 255, 0.3)`
    ctx.beginPath()
    ctx.rect(x - nameplateWidth / 2, y, nameplateWidth, nameplateHeight / 2)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.rect(x - nameplateWidth / 2, y, nameplateWidth, nameplateHeight)
    ctx.stroke()
    ctx.strokeStyle = "black"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.rect(x - nameplateWidth / 2, y, nameplateWidth, nameplateHeight)
    ctx.stroke()
    ctx.strokeStyle = "black"
    ctx.fillStyle = "white"
    ctx.lineWidth = 4
    ctx.font = "12px arial"
    ctx.fillStyle = "white"
    ctx.strokeText(dw.c.hp, x, y + 12)
    ctx.fillText(dw.c.hp, x, y + 12)
    let name = `\u{1F396}\uFE0F${dw.c.level} ${dw.c.name.toLowerCase()}`
    ctx.font = "20px arial"
    ctx.textAlign = "center"
    ctx.strokeText("\u{1F5E1}\uFE0F", x, y - 8 - 30)
    ctx.fillText("\u{1F5E1}\uFE0F", x, y - 8 - 30)
    ctx.font = "16px arial"
    ctx.fillStyle = "orange"
    ctx.textAlign = "right"
    let dmg = getSkillDamage(getBestSkill(0))
    let textWidth = ctx.measureText("x").width + 8
    ctx.strokeText(dmg, x - textWidth, y - 8 - 30)
    ctx.fillText(dmg, x - textWidth, y - 8 - 30)
    ctx.fillStyle = "white"
    myBattleScore = Math.round(getMyBattleScore(true))
    ctx.textAlign = "left"
    textWidth = ctx.measureText("x").width + 8
    ctx.strokeText(myBattleScore, x + textWidth, y - 8 - 30)
    ctx.fillText(myBattleScore, x + textWidth, y - 8 - 30)
    ctx.font = "24px arial"
    ctx.textAlign = "center"
    ctx.strokeText(name, x, y - 12)
    ctx.fillText(name, x, y - 12)
})
dw.on("drawEnd", (ctx, cx, cy) => {

    if(noRender) return

    for(let m of dw.findEntities(e => e.ai))
    {
        drawLineToPOI(ctx, cx, cy, { x: m.x + m.dx, y: m.y + m.dy }, "black", m)
    }
})

let lastTextUpdate = new Date()
dw.on("drawEnd", (ctx, cx, cy) => {

    if(noRender) return

    ctx.strokeStyle = "green"
    ctx.fillStyle = "white"
    ctx.font = "18px arial"
    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))
    let curTextUpdate = new Date()
    let seconds = (curTextUpdate.getTime() - lastTextUpdate.getTime()) / 1000
    lastTextUpdate = curTextUpdate
    for (let text of floatingText) {
        if (text.life < 0)
            continue
        let x = text.x * 96 - camOffsetX
        let y = text.y * 96 - camOffsetY
        ctx.lineWidth = 4
        ctx.fillStyle = "black"
        ctx.strokeStyle = `rgb(255, 0, 0, 0.8)`
        ctx.fillStyle = "white"
        if (text.target == dw.c.id) {
            ctx.lineWidth = 2
            ctx.strokeStyle = `rgb(0, 0, 0, 0.8)`
            ctx.fillStyle = "red"
        }
        let fontSize = 28 * combatTextTween(text.life / text.maxLife)
        drawText(ctx, fontSize, text.text, x, y)
        text.life -= seconds
    }
    floatingText = floatingText.filter((t) => t.life > 0)
})

function drawText(ctx, fontSize, text, x, y) {
    ctx.textAlign = "left"
    ctx.font = `bold ${fontSize}px arial`
    ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
    let textWidth = ctx.measureText(text).width
    const offscreen = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height)
    const offCtx = offscreen.getContext("2d")
    const offscreen2 = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height)
    const offCtx2 = offscreen2.getContext("2d")
    offCtx.textAlign = "left"
    offCtx2.textAlign = "left"
    offCtx.fillStyle = "blue"
    offCtx2.fillStyle = "blue"
    let squarePath = new Path2D()
    squarePath.rect(x, y - fontSize * 0.2, textWidth, fontSize * 0.6)
    squarePath.closePath()
    offCtx.clip(squarePath)
    offCtx.fillStyle = `rgb(245, 106, 32, 0.6)`
    offCtx.font = `bold ${fontSize}px arial`
    offCtx.fillText(text, x, y)
    let squarePath2 = new Path2D()
    squarePath2.rect(x, y - fontSize * 0.5, textWidth, fontSize)
    squarePath2.closePath()
    offCtx2.clip(squarePath2)
    offCtx2.fillStyle = `rgb(245, 106, 32, 0.3)`
    offCtx2.font = `bold ${fontSize}px arial`
    offCtx2.fillText(text, x - textWidth / 2, y)
    if (offCtx.canvas.width > 0 && offCtx.canvas.height > 0) {
        ctx.drawImage(offscreen2.transferToImageBitmap(), 0, 0)
        ctx.drawImage(offscreen.transferToImageBitmap(), 0, 0)
    }
}

function combatTextTween(x) {
    return x * easeInOutElastic(x) + (1 - x) * easeInOutQuint(x)
}
function easeInOutElastic(x) {
    const c5 = 2 * Math.PI / 4.5
    return x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2 : Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5) / 2 + 1
}
function easeInOutQuint(x) {
    return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2
}
function drawLineToPOI(ctx, cx, cy, target, style, from = dw.c) {
    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))
    if (target) {
        ctx.fillStyle = style
        ctx.strokeStyle = style
        let spotx = target.x * 96 - camOffsetX - 5
        let spoty = target.y * 96 - camOffsetY - 5
        let playerx = from.x * 96 - camOffsetX
        let playery = from.y * 96 - camOffsetY
        ctx.beginPath()
        ctx.moveTo(playerx, playery)
        ctx.lineTo(spotx + 5, spoty + 5)
        ctx.stroke()
        ctx.beginPath()
        ctx.rect(spotx, spoty, 10, 10)
        ctx.fill()
    }
}
