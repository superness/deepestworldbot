class LocalCache {
    valueCache = {}
    constructor() {
        this.cachedValues = {}
    }
    get(key) {
        if(this.valueCache[key] == undefined) {
            console.log('adding to local cache', key, this.valueCache, this.valueCache[key], dw.get(key))
            this.valueCache[key] = dw.get(key) ?? null
        }
        return this.valueCache[key]
    }
    set(key, value) {
        console.log('setting cache value', key, value)
        this.valueCache[key] = value
        dw.set(key, value)
    }
}

let cache = new LocalCache()

class Stopwatch {
    constructor() {
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
}


function getBiome(x, y, z){
    return dw.getTerrain(x, y, z, -1)
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

let nonTraversableEntities = []
function updateNonTraversableEntities() {
    nonTraversableEntities = []
    let blockingEntities = dw.findEntities((e) => !e.ai && !e.player && !e.ore && !e.md.includes("portal"))
    let count = blockingEntities.length
    for (let i = 0; i < count; ++i) {
        let e = blockingEntities[i]
        let hitbox = dw.md.items[e.md]?.hitbox ?? { w: 0, h: 0 }
        nonTraversableEntities.push({ x: e.x - hitbox.w / 2, y: e.y - hitbox.h, id: e.id, entity:1 })
        nonTraversableEntities.push({ x: e.x - hitbox.w / 2, y: e.y - hitbox.h / 2, id: e.id, entity:1 })
        nonTraversableEntities.push({ x: e.x, y: e.y - hitbox.h, id: e.id, entity:1 })
        nonTraversableEntities.push({ x: e.x, y: e.y - hitbox.h / 2, id: e.id, entity:1 })
    }
    let chunkPropertyKeys = Object.keys(dw.chunks).filter((k) => k.startsWith(dw.c.l))
    for (let k of chunkPropertyKeys) {
        let l = k.split(".")[0] - 1
        let r = k.split(".")[2]
        let c = k.split(".")[1]
        let oneBelow = `${l}.${c}.${r}`
        for (let i = 0; i < 16; ++i) {
            for (let j = 0; j < 16; ++j) {
                let isHole = dw.chunks[oneBelow] && dw.chunks[oneBelow][0][i][j] < 1
                if (dw.chunks[k][0][i][j] != 0 || isHole) {
                    let x = r * 16 + j
                    let y = c * 16 + i
                    if (x < dw.c.x - gridWidth / 2 || x > dw.c.x + gridWidth / 2 || y < dw.c.y - gridHeight / 2 || y > dw.c.y + gridHeight / 2) {
                        continue
                    }
                    nonTraversableEntities.push({ x: x + 0.5, y: y + 0.5, chunk: 1 })
                    nonTraversableEntities.push({ x: x + terrainThickness / 2, y: y + terrainThickness / 2, chunk: 1 })
                    nonTraversableEntities.push({ x: x + 1 - terrainThickness / 2, y: y + terrainThickness / 2, chunk: 1 })
                    nonTraversableEntities.push({ x: x + terrainThickness / 2, y: y + 1 - terrainThickness / 2, chunk: 1 })
                    nonTraversableEntities.push({ x: x + 1 - terrainThickness / 2, y: y + 1 - terrainThickness / 2, chunk: 1 })
                }
            }
        }
    }
}

let nonTraversableEntitiesUpdatePeriod = 500
let lastNonTraversableEntitiesUpdate = new Date()
function getNonTraversableEntities() {
    let now = new Date()
    let mssince = now.getTime() - lastNonTraversableEntitiesUpdate.getTime()
    if(mssince > nonTraversableEntitiesUpdatePeriod) {
        updateNonTraversableEntities()
        lastNonTraversableEntitiesUpdate = now
    }
    return nonTraversableEntities
}


class ComputerVision {
    
    static scaryMonsterRadius = 3.51
    static terrainThickness = 0.51
    static entityThickness = 0.51

    // Skill and damage calcuation
    static getBestSkill(targetDistance, c, target = null) {
        let sortedSkills = c.skills.filter(s => ComputerVision.getSkillDamage(s) > 0).filter(s => s.range >= targetDistance).sort((a,b) => ComputerVision.getSkillDamage(b) - ComputerVision.getSkillDamage(a))
    
        sortedSkills = sortedSkills.filter(s => !(s.fx?.bomb && (target?.fx[`${s.md}Bomb`] || (target?.hp < ComputerVision.getSkillDamage(s) * 2.5))))

        if(sortedSkills.length == 0) return null
    
        let bestSkill = sortedSkills[0]

        if(ComputerVision.getSkillDamage(bestSkill) == 0) return null

        bestSkill.skillBagIndex = c.skills.findIndex(s => s == bestSkill)
        return bestSkill
    }
    
    
    static getSkillDamage(skill) {
        let healingRuneParts = ['heal', 'lifeshield', 'blink']
        if (!skill)
            return 0
        if(healingRuneParts.filter(p => skill.md.toLowerCase().includes(p)).length > 0)
            return 0
        let skillDmg = (skill.acid + skill.cold + skill.fire + skill.elec + skill.phys) ?? 0
        let totalDmg = Math.floor(skillDmg * (1.0 - skill.crit) + (skill.crit * skill.critMult * skillDmg)) * (skill.fx.mpToHpCost == 1 ? 0.5 : 1)
        return totalDmg
    }    
    
    static getMonsterBattleScore(monster, useFullHp = false) { 
        let hpUse = useFullHp ? monster.hpMax : monster.hp
        
        return Math.sqrt(hpUse * (ComputerVision.getMonsterDmg(monster)))
                               * (monster.md.includes('Def') ? 1.25 : 1)
    }
    
    static getMonsterDmg(monster) {

        if(monster.md.toLowerCase().includes('magicshrub')) {
            return 1
        }

        let dmg = 19 * Math.pow(1.1, monster.level)
        if (monster.r ?? 0 > 1) {
            dmg *= 1 + monster.r * 0.5
        }
        return Math.max(1, (dmg * (monster.md.includes('Pow') ? 1.25 : 1)))
    }
    
    static getMonsterDmgReduction() {
        return 0.9
    }

    static getMyDmg(c) {
        let mySkillInfo = c.skills[0]
        return (ComputerVision.getSkillDamage(mySkillInfo) * ComputerVision.getMonsterDmgReduction())
    }
    
    static getMaxDamageDealtBeforeOom(c) {    
        let myBestSkill = c.skills[0]
        let mySkillInfo = myBestSkill

        if(!mySkillInfo) return 1
    
        if (c.mpRegen > mySkillInfo.cost) return Number.MAX_SAFE_INTEGER
    
        if(c.mp < mySkillInfo.cost) return 0
    
        let timeToOom = c.mp / (mySkillInfo.cost - c.mpRegen)
        let myDmg = ComputerVision.getMyDmg(c)
    
        let maxPossibleDmg = timeToOom * myDmg
        return maxPossibleDmg
    }

    static getMyDmgMultiplier() {
        return 1
    }
    
    static getMyBattleScore(c, useMaxHp = false) {
        let hpScorePart = (useMaxHp ? c.hpMax : c.hp) + (c.skills[0].fx?.onHit?.some(e => e.md == "hpToMpDeathSelf") ? (useMaxHp ? c.mpMax : c.mp) : 0)

        let potentialScore = (ComputerVision.getMyDmg(c) + c.hpRegen + (c.skills[0].fx?.onHit?.some(e => e.md == "hpToMpDeathSelf") ? dw.c.mpRegen : 0)) * hpScorePart
        let maxTargetLife = ComputerVision.getMaxDamageDealtBeforeOom(c)
        let maxDmgScore = maxTargetLife * (ComputerVision.getMyDmg(c))
        let dmgScorePart = Math.min(maxDmgScore, potentialScore)
        let battleScore = Math.sqrt(dmgScorePart)

        if(isNaN(battleScore)) battleScore = 0
    
        battleScore *= ComputerVision.getMyDmgMultiplier()

        return battleScore
    }

    static getMpRequiredToDefeatMonster(monster, c) {
        let mpRequired = (monster.hp / ComputerVision.getMyDmg(c)) * ((c.skills[0]?.cost ?? 0) - c.mpRegen)
        return mpRequired
    }

    static getMonstersTargettingMeBattleScore(c, monsters) {
        let monstersTargettingMe = monsters.filter(e => e.targetId && e.targetId == c.id)
        
        let monstersTargettingMeBattleScore = 0
        if(monstersTargettingMe.length > 0) {
            monstersTargettingMeBattleScore = monstersTargettingMe.map(e => ComputerVision.getMonsterBattleScore(e)).reduce((accumulator, currentValue) => accumulator + currentValue, monstersTargettingMeBattleScore)
        }
    
        return monstersTargettingMeBattleScore
    }    

    static isValidTarget(entity, nonTraversableEntities, c, monsters, targetZoneLevel, nearMonsterUnsafeRadius ) {
        if (c.targetId == entity.id) {
            // try to 'un-target' a monster that walked near another monster since we targetted it
            if(c.combat) return true
            let otherMonsters = monsters.filter((e) => e.ai && e.id != entity.id)
            for (let monster of otherMonsters) {
                if (ComputerVision.distance(monster, entity) < nearMonsterUnsafeRadius) {
                    return false
                }
            }
            return true
        }
        if (!ComputerVision.hasLineOfSight(entity, c, nonTraversableEntities))
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

        let monsterBattleScore = ComputerVision.getMonsterBattleScore(entity)
        let myBattleScore = ComputerVision.getMyBattleScore(c)
        let monstersTargettingMe = monsters.filter(e => e.targetId && e.targetId == c.id)
        let monstersTargettingMeBattleScore = ComputerVision.getMonstersTargettingMeBattleScore(c, monsters) * monstersTargettingMe.length
        if ((monsterBattleScore + monstersTargettingMeBattleScore) > myBattleScore)
        {
            return false
        }
        let mpRequired = ComputerVision.getMpRequiredToDefeatMonster(entity, c)
        if (c.mp < mpRequired)
        {
            return false
        }
        monsters = monsters.filter((e) => e.ai && e.id != entity.id)
        for (let monster of monsters) {
            if (ComputerVision.distance(monster, entity) < nearMonsterUnsafeRadius) {
                return false
            }
        }

        return true
    }

    static sqr(x) {
        return x * x
    }
    static dist2(v, w) {
        return ComputerVision.sqr(v.x - w.x) + ComputerVision.sqr(v.y - w.y)
    }
    static distToSegmentSquared(p, v, w) {
        let l2 = ComputerVision.dist2(v, w)
        if (l2 == 0)
            return ComputerVision.dist2(p, v)
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
        t = Math.max(0, Math.min(1, t))
        return ComputerVision.dist2(p, {
            x: v.x + t * (w.x - v.x),
            y: v.y + t * (w.y - v.y)
        })
    }
    static distToSegment(p, v, w) {
        return Math.sqrt(ComputerVision.distToSegmentSquared(p, v, w))
    }
    static hasLineOfSight(target, from, nonTraversableEntities = [], thickCheckOverride = null) {
        if (!target)
            return false
        
        for (let e of nonTraversableEntities) {
            if ("id" in e && "id" in target && e.id === target.id)
                continue
            let thickCheck = this.terrainThickness
            if (e.id)
                thickCheck = this.entityThickness

            thickCheck = thickCheckOverride ?? thickCheck
            if (ComputerVision.distance(e, from) < thickCheck) {
                let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)
                let vecToEntity = { x: e.x - from.x, y: e.y - from.y }
                let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
                let sameDir = dot([vecToEntity.x, vecToEntity.y], [vecToSpot.x, vecToSpot.y]) < 0
                if (sameDir)
                    continue
            }
            if (ComputerVision.distToSegment(e, from, target) < thickCheck) {
                return false
            }
        }
        return true
    }

    static hasLineOfSafety(target, from, monsters, c, targetId, dangerousEnemyPredicate = e => e.bad && e.id != targetId) {
        if (!target)
            return false
        let hostlies = monsters.filter(dangerousEnemyPredicate).filter(m => targetId != m.id)
        let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)
        for (let monster of hostlies) {
            if (targetId == monster.id)
                continue
            if (ComputerVision.distance(monster, c) <= ComputerVision.scaryMonsterRadius) {
                let vecToMonster = { x: monster.x - from.x, y: monster.y - from.y }
                let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
                let sameDir = dot([vecToMonster.x, vecToMonster.y], [vecToSpot.x, vecToSpot.y]) < 0
                if (sameDir)
                    continue
            }
            let distToTarget = ComputerVision.distToSegment(monster, from, target)
            if (distToTarget < ComputerVision.scaryMonsterRadius) {
                // monster direction vs spot to monster
                if(monster.bad)
                {
                    // // Uncomment this to allow walking behind hostile monsters when wandering
                    // let vecDir = {x:monster.dx, y:monster.dy}
                    // let vecPoint = {x:target.x - monster.x, y:target.y - monster.y}
                    // let sameDir = dot([vecDir.x, vecDir.y], [vecPoint.x, vecPoint.y]) < 0
                    // let vecPlayerMonster = {x:monster.x - from.x, y:monster.y - from.y}
                    // let vecPlayerPoint = {x:target.x - from.x, y:target.y - from.y}
                    // let sameDirPlayer = dot([vecPlayerMonster.x, vecPlayerMonster.y], [vecDir.x, vecDir.y]) < 0
                    // let sameDirPlayerPoint = dot([vecPlayerPoint.x, vecPlayerPoint.y], [vecPoint.x, vecPoint.y]) < 0

                    // if (sameDir && !sameDirPlayer && sameDirPlayerPoint)
                    // {
                    //     continue
                    // }
                }
                return false
            }
        }
        return true
    }

    static getSpotInfo(x, y, monsters, nonTraversableEntities, c, optimalMonsterRange, optimalMonsterRangeBuffer, targetZoneLevel, targetId, nearMonsterUnsafeRadius) {
        let nearMonsters = monsters.filter((m) => ComputerVision.distance({ x, y }, m))
        let target = monsters.filter((entity) => entity.id === targetId).shift()
        let spotValue = 50
        let spotType = "open"
        if (!ComputerVision.hasLineOfSight({ x, y }, c, nonTraversableEntities)) {
            spotValue = 555
            spotType = "obstructed"
        }
        if (!ComputerVision.hasLineOfSafety({ x, y }, c, monsters.filter(m => m.id != targetId), c, targetId)) {
            spotValue = 555
            spotType = "dangerous"
        }
        if (spotType != "obstructed" && spotType != "dangerous") {
            for (let monster of nearMonsters) {
                let monsterTest = { x: monster.x, y: monster.y }
                let dist = Math.max(ComputerVision.distance({ x, y }, monster))
                
                if (dist < optimalMonsterRange + optimalMonsterRangeBuffer && ComputerVision.isValidTarget(monster, nonTraversableEntities, c, monsters, targetZoneLevel, nearMonsterUnsafeRadius)) {
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
                    if (!ComputerVision.hasLineOfSight({ x, y }, monsterTest, nonTraversableEntities, 0)) {
                        delta += 100
                        spotType = "partially-obstructed"
                    }
                    spotValue += delta
                } else {
                    let targetGooOtherGooCombat = target && target.md.toLowerCase().includes("goo") && monster.md.toLowerCase().includes("goo") && (c.combat == 1)
                    let doAvoid = monster.bad || targetGooOtherGooCombat
                    let prevScaryRadius = this.scaryMonsterRadius
                    if (targetGooOtherGooCombat && !monster.bad) {
                        this.scaryMonsterRadius = 3
                    }
                    if (!ComputerVision.hasLineOfSafety({x:x, y:y}, c, monsters, c, targetId, e => e.id == monster.id) && doAvoid && ComputerVision.hasLineOfSight({ x:x, y:y }, monster, nonTraversableEntities, 0)) {
                        spotValue += 500
                        spotType = "dangerous"
                    }
                    this.scaryMonsterRadius = prevScaryRadius
                }
            }
        }
        return { positionValue: spotValue, type: spotType, lastUpdate: new Date() }
    }
        
    static distance(a, b)
    {
        var distance = Math.sqrt((Math.pow(a.x-b.x,2))+(Math.pow(a.y-b.y,2)))
        return distance;
    };
}

function workerCodeFunc() {
    let gridWidth = 22
    let gridHeight = 14
    let gridArrWidth = gridWidth * 3
    let gridArrHeight = gridHeight * 3
    
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
        
    function distance(a, b)
    {
        var distance = Math.sqrt((Math.pow(a.x-b.x,2))+(Math.pow(a.y-b.y,2)))
        return distance;
    }

    self.addEventListener('message', e => {

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

        let fullGridProcessed = false;

        function* yieldVisionGridUpdatesOnOldSpots() {
            while (true) {
                let now = new Date()
                visionGridEx.sort((a, b) => (now.getTime() - b.data.lastUpdate.getTime()) / b.dist - (now.getTime() - a.data.lastUpdate.getTime()) / a.dist)
                for (let spot of visionGridEx) {
                    now = new Date()
                    let gridLeft2 = e.data.c.x - e.data.gridWidth / 2
                    let gridTop2 = e.data.c.y - e.data.gridHeight / 2
                    let squareWidth2 = e.data.gridWidth / gridArrWidth
                    let squareHeight2 = e.data.gridHeight / gridArrHeight
                    squareWidth2 = e.data.gridWidth / e.data.gridArrWidth
                    squareHeight2 = e.data.gridHeight / e.data.gridArrHeight
                    let x = gridLeft2 + spot.i * squareWidth2 - squareWidth2 / 2
                    let y = gridTop2 + spot.j * squareHeight2 - squareHeight2 / 2
                    let spotInfo = ComputerVision.getSpotInfo(x, y, e.data.monsters, e.data.nonTraversableEntities, e.data.c, e.data.optimalMonsterRange, e.data.optimalMonsterRangeBuffer, e.data.targetZoneLevel, e.data.targetId, e.data.nearMonsterUnsafeRadius)
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
    }, 
    false);
}

const stopWatchCode = `var Stopwatch = ${Stopwatch.toString()}`
const workerCode = `${stopWatchCode};var ComputerVision = ${ComputerVision.toString()};${workerCodeFunc.toString()};workerCodeFunc()`

const blob = new Blob([workerCode], { type: 'application/javascript' });
const visionGridWorker = new Worker(URL.createObjectURL(blob));


let optimalMonsterRange = dw.c.skills[0]
let optimalMonsterRangeBuffer = 0
let gridUpdatePeriod = 7
let gridWidth = 22
let gridHeight = 14
let gridArrWidth = gridWidth * 3
let gridArrHeight = gridHeight * 3
let scaryMonsterRadius = ComputerVision.scaryMonsterRadius
let terrainThickness = ComputerVision.terrainThickness
let entityThickness = ComputerVision.entityThickness
let targetZoneLevel = dw.getZoneLevel()//dw.c.level
let nearMonsterUnsafeRadius = 2.2

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

async function updateVisionGridOld() {
    visionGridWorker.postMessage({
        gridUpdatePeriod: gridUpdatePeriod,
        monsters: dw.e.filter((e) => e.ai),
        nonTraversableEntities: getNonTraversableEntities(),
        c:{ id:dw.c.id, x:dw.c.x, y:dw.c.y, skills:dw.c.skills, hp:dw.c.hp, hpMax:dw.c.hpMax, hpRegen:dw.c.hpRegen, mp:dw.c.mp, mpRegen:dw.c.mpRegen, combat:dw.c.combat},
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

    await sleep(gridUpdatePeriod);
    updateVisionGridOld()
}

visionGridWorker.addEventListener('message', function(e) {
  e.data.forEach(update => {
    visionGrid[update.i][update.j] = { x: update.x, y: update.y, threat: update.threat, type: update.type, lastUpdate: update.lastUpdate };
  });
}, false);

setTimeout(updateVisionGridOld, 100);













// Floating combat text
let floatingText = []
dw.on("hit", (data) => {
    for (let hit of data) {
        if (!hit.amount)
            continue

        let target = dw.findEntities((entity) => entity.id === hit.target).shift()

        let newText = { text: hit.amount, x: target?.x ?? 0, y: target?.y ?? 0, target: hit.target, life: 1.3, maxLife: 1.3 }
        if ((target?.id ?? 0) == dw.c.id) {
            newText.x -= 1
            newText.y -= 1
        }
        floatingText.push(newText)
        if (hit.rip && hit.target == dw.c.id) {
            moveToSpot = movingToSpot = dw.c.respawn
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
                    if ((target?.level ?? 0) >= targetZoneLevel) {
                        targetZoneLevel++
                        dw.log(`changing target zone level up to ${targetZoneLevel}`)
                    }
                }
                if (dw.c.hp / dw.c.hpMax < 0.5) {
                    targetZoneLevel--
                    targetZoneLevel = Math.max(1, targetZoneLevel)
                    dw.log(`changing target zone level down to ${targetZoneLevel}`)
                }
            }
        }
    }
})

// This keeps the character from pulling until it has enough mp to win the fight
setInterval(function () {
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    if (!target) {
        optimalMonsterRangeBuffer = 0
        return
    }

    let mpRequired = ComputerVision.getMpRequiredToDefeatMonster(target, dw.c, getBiome(dw.c.x, dw.c.y, dw.c.z))
    if (dw.c.mp < mpRequired)
        optimalMonsterRangeBuffer = 1
    else if((dw.c.hp < dw.c.hpMax * 0.8) && dw.c.combat != 1)
        optimalMonsterRangeBuffer = 1
    else
        optimalMonsterRangeBuffer = -0.1
}, 100)

function getMonstersTargettingMeBattleScore() {
    let monstersTargettingMe = dw.findEntities(e => e.targetId && e.targetId == dw.c.id)
    
    let monstersTargettingMeBattleScore = 0
    if(monstersTargettingMe.length > 0) {
        monstersTargettingMeBattleScore = monstersTargettingMe.map(e => ComputerVision.getMonsterBattleScore(e)).reduce((accumulator, currentValue) => accumulator + currentValue, monstersTargettingMeBattleScore)
    }

    return monstersTargettingMeBattleScore
}

// Pick where to move
let moveUpdatePeriod = 30
let movePeriod = 100
let searchOffset = 2
let searchOffsetMission = 1
let recencyAvoidanceRadius = 1
let recentSpots = []

let lastMoveToSpotReset = new Date()

setInterval(function () {
    let bestSpot = getGoodSpots(15).shift()
    bestSpot = bestSpot ?? getGoodSpots(40).shift()

    moveToSpot = moveToSpot ?? bestSpot

    if(!moveToSpot) return

    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    let moveToSpotIsClose = dw.distance(moveToSpot ?? dw.c, dw.c) < 0.03

    let isRecentSpot = getSpotRecentlyUsed(moveToSpot.x, moveToSpot.y)

    let isSpotSafe = ComputerVision.hasLineOfSafety(moveToSpot, dw.c, dw.e.filter(e => e.ai), dw.c, dw.targetId)
    let targetIsGoo = target && target.md.toLowerCase().includes("goo") && dw.c.combat

    if(targetIsGoo)
    {
        isSpotSafe = isSpotSafe && ComputerVision.hasLineOfSafety(moveToSpot, dw.c, dw.e.filter(e => e.ai), dw.c, dw.targetId, e => e.md.toLowerCase().includes("goo") && e.id != dw.targetId)
    }

    let canSeeSpot = ComputerVision.hasLineOfSight(moveToSpot, dw.c, getNonTraversableEntities())

    let staleMoveToSpot = (new Date().getTime() - lastMoveToSpotReset.getTime()) > 25000

    if (!bestSpot && (moveToSpotIsClose || !isSpotSafe || !canSeeSpot || staleMoveToSpot || isRecentSpot)) {
        let goodSpots = getGoodSpots(50, true, true)

        // Clear the recent spot list if we are trapped under them
        if(goodSpots.length == 0) {
            console.log('resetting recent spots')
            recentSpots = []
        }

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

    if(bestSpot) {
        lastMoveToSpotReset = new Date()
    }

    moveToSpot = bestSpot ?? moveToSpot
}, moveUpdatePeriod)

setInterval(function() {
    recentSpots.push({x: dw.c.x, y:dw.c.y, r: recencyAvoidanceRadius})
}, 1000)

function moveRecentSpotNearChunks(spot) {
    let distConnection = spot.r * 0.9

    let nonTraversableEntities = getNonTraversableEntities()
    let closestConnection = nonTraversableEntities.filter(e => e.chunk)
                                                 .sort((a,b) => dw.distance(a, spot) - dw.distance(b, spot))
                                                 .shift()

    if(closestConnection) {
        let dx = spot.x - closestConnection.x
        let dy = spot.y - closestConnection.y

        let len = dw.distance(closestConnection, spot)

        dx *= 1/len
        dy *= 1/len

        if(isNaN(dx)) dx = 0
        if(isNaN(dy)) dy = 0

        let targetPos = {x:closestConnection.x + (dx * distConnection), y:closestConnection.y + (dy * distConnection)} 

        dx = targetPos.x - spot.x
        dy = targetPos.y - spot.y

        len = dw.distance(targetPos, spot)

        dx = Math.min(dx, dx * 1/len)
        dy = Math.min(dy, dy * 1/len)

        if(isNaN(dx)) dx = 0
        if(isNaN(dy)) dy = 0
        spot.x += dx * 0.1
        spot.y += dy * 0.1
    }

}

function resolveRecentSpotCollisions(spot) {
    let collisionSpots = recentSpots.filter(t => spot != t)
                                    .filter(t => dw.distance(t, spot) < (t.r + spot.r) / 2) 

    let distplace = {x:0,y:0}
    for(let closestConnection of collisionSpots) {
        let distConnection = (spot.r + closestConnection.r) / 2
    
        let dx = spot.x - closestConnection.x
        let dy = spot.y - closestConnection.y
    
        let len = dw.distance(closestConnection, spot)
    
        dx *= 1/len * distConnection
        dy *= 1/len * distConnection
    
        if(isNaN(dx)) dx = 0
        if(isNaN(dy)) dy = 0
    
        let targetPos = {x:closestConnection.x + dx, y:closestConnection.y + dy} 
    
        dx = targetPos.x - spot.x
        dy = targetPos.y - spot.y
    
        if(isNaN(dx)) dx = 0
        if(isNaN(dy)) dy = 0
        distplace.x += dx
        distplace.y += dy
    }

    spot.x += distplace.x
    spot.y += distplace.y
}

setInterval(function () {
    let nonTraversableEntities = getNonTraversableEntities().filter(e => e.chunk)

    let inRangeSpots = recentSpots.filter(s => dw.distance(dw.c, s) < s.r)
    if (recentSpots.length == 0 || inRangeSpots.length == 0) {
        let dx = 0
        let dy = 0
        recentSpots.push({ x: dw.c.x - dx * 1/5, y: dw.c.y - dy * 1/5, r: recencyAvoidanceRadius })
    }

    let connectToTargets = nonTraversableEntities
    let numUpdates = 0
    for(let i = recentSpots.length - 1; i >= 0; --i) {
        let currentSpot = recentSpots[i]
        currentSpot.r = Math.min(2.5, currentSpot.r *= 1.03)

        if(numUpdates++ > 20) continue;

        moveRecentSpotNearChunks(currentSpot)
        resolveRecentSpotCollisions(currentSpot)
    }
}, 100)

setInterval(function () {
    while (recentSpots.length > 1000) {
        recentSpots.shift()
    }
}, 6000)

function getSpotRecentlyUsed(x, y, notThisOne = null) {
    for (let recentSpot of recentSpots) {
        if(recentSpot == notThisOne) continue
        let distSpot = dw.distance({ x, y }, recentSpot)
        if (distSpot < recentSpot.r) {
            return true
        }
    }
    return false
}

function getGoodSpots(range, avoidRecent = false, reverseSort = false) {
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
        return reverseSort ? db - da : da - db
    })
    return goodSpots
}

// Emit the move command
let moveToSpot = { x: dw.c.x, y: dw.c.y }
let movingToSpot = { x: dw.c.x, y: dw.c.y }
setInterval(function () {
    if (!moveToSpot) {
        return
    }
    if (cache.get(`${dw.c.name}_manualmove`) === true)
        return
    movingToSpot = movingToSpot ?? moveToSpot

    if(dw.distance(moveToSpot, movingToSpot) > 11) movingToSpot = moveToSpot

    let dx = moveToSpot.x - movingToSpot.x
    let dy = moveToSpot.y - movingToSpot.y
    movingToSpot.x += dx * 4 / (2e3 / movePeriod)
    movingToSpot.y += dy * 4 / (2e3 / movePeriod)
    let dist = dw.distance(movingToSpot, dw.c)
    if (dist < 0.1)
        return
    dw.emit("move", movingToSpot)
}, movePeriod)

// Attack stuff
cache.set(`${dw.c.name}_skipAttacks`, cache.get(`${dw.c.name}_skipAttacks`) ?? false)
setInterval(function () {
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    if(!dw.c.combat && target && !ComputerVision.isValidTarget(target, getNonTraversableEntities(), dw.c, dw.e, targetZoneLevel)) {
        dw.setTarget(0)
        return
    }
    
    if (cache.get(`${dw.c.name}_skipAttacks`) == true)
    {
        return 
    }

    target = dw.findClosestMonster((m) => ComputerVision.isValidTarget(m, getNonTraversableEntities(), dw.c, dw.e, targetZoneLevel))

    if (!target)
    {
        return
    }
    
    dw.setTarget(target.id)
    let distTarget = dw.distance(target, dw.c)
    let skillUse = ComputerVision.getBestSkill(distTarget, dw.c, target)
 
    // No good skills to use
    if (!skillUse || skillUse === undefined) {
        return
    }

    optimalMonsterRange = skillUse.range

    let isSkillReady = dw.isSkillReady(skillUse.skillBagIndex)
    if (dw.c.mp < (skillUse?.cost ?? 0) || !isSkillReady) {
        return
    }

    if(dw.distance(target, dw.c) > optimalMonsterRange) return

    if(skillUse.fx.bomb && target.fx.bomb)
    {
        return
    }

    if(isSkillReady)
    {
        console.log('using skill', skillUse.md, skillUse.skillBagIndex)
        dw.useSkill(skillUse.skillBagIndex, target.id)
    }
}, 20)


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





let noRender = false




let showComputerVision = cache.get("showComputerVision") ?? true
cache.set("showComputerVision", showComputerVision)

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

    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))
    let squareWidth2 = gridWidth / gridArrWidth * 96
    let squareHeight2 = gridHeight / gridArrHeight * 96
    ctx.font = "12px arial"
    let now = new Date()
    for (let i = 0; i < gridArrWidth; ++i) {
        for (let j = 0; j < gridArrHeight; ++j) {
            if (!cache.get("showComputerVision")) {
                continue
            }
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
    let myBattleScore = Math.round(ComputerVision.getMyBattleScore(dw.c, true))
    let nonTraversableEntities = getNonTraversableEntities()
    for (let monster of monsters) {

        let smoothPos = monster.id in entititiesSmoothPosMap ? entititiesSmoothPosMap[monster.id] : monster
        let x2 = smoothPos.x * 96 - camOffsetX
        let y2 = smoothPos.y * 96 - camOffsetY - 110
        
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
        let dmg2 = Math.round(ComputerVision.getMonsterDmg(monster))
        let battleScore = Math.round(ComputerVision.getMonsterBattleScore(monster))
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
        } else if (ComputerVision.isValidTarget(monster, nonTraversableEntities, dw.c, dw.e, targetZoneLevel, nearMonsterUnsafeRadius, getBiome(dw.c.x, dw.c.y, dw.c.z))) {
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
    let dmg = ComputerVision.getSkillDamage(dw.c.skills[0])
    let textWidth = ctx.measureText("x").width + 8
    ctx.strokeText(dmg, x - textWidth, y - 8 - 30)
    ctx.fillText(dmg, x - textWidth, y - 8 - 30)
    ctx.fillStyle = "white"
    myBattleScore = Math.round(ComputerVision.getMyBattleScore(dw.c, true))
    ctx.textAlign = "left"
    textWidth = ctx.measureText("x").width + 8
    ctx.strokeText(`${myBattleScore}`, x + textWidth, y - 8 - 30)
    ctx.fillText(`${myBattleScore}`, x + textWidth, y - 8 - 30)
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






function clearMenuButtons() {
    let tempButtons = window.top.document.getElementsByClassName('temp-btn')

    while(tempButtons.length > 0) {
        tempButtons[0].remove()
    }

    window.top.document.getElementsByClassName('toggle-menu')[0].classList.add('me-1')
    window.top.document.getElementById('menuButtonsContextMenu')?.remove()
}

function addMenuButton(title, onclick, parentDiv = window.top.document.getElementById('menuButtons')){ 
    var newi = window.top.document.createElement('i')
    newi.class='fa-solid'
    newi.innerText = title

    newi.onclick = () => onclick(newi)

    var newMenuButton = window.top.document.createElement('div')
    newMenuButton.className = 'ui-btn px-1 me-1 temp-btn'

    newMenuButton.appendChild(newi)

    parentDiv.appendChild(newMenuButton)
}




function addMenuButtonContextMenu() {
    let menuButtons = window.top.document.getElementById('menuButtons')
    let menuButtonsContextMenu  = window.top.document.createElement('div')
    
    menuButtonsContextMenu.className="ui ui-content invisible"
    menuButtonsContextMenu.style="position:absolute;bottom:50px;right:5px;"
    menuButtonsContextMenu.id='menuButtonsContextMenu'

    menuButtons.appendChild(menuButtonsContextMenu)

}

function toggleMenuButtonContextMenu() {
    let menuButtonsContextMenu = window.top.document.getElementById('menuButtonsContextMenu')
    if(menuButtonsContextMenu.className.includes('invisible')) {
        menuButtonsContextMenu.classList.remove('invisible')
    }
    else {
        menuButtonsContextMenu.classList.add('invisible')
    }
}

function addMenuContextMenuButton(title, onclick) {
    let menuButtonsContextMenu = window.top.document.getElementById('menuButtonsContextMenu')

    addMenuButton(title, onclick, menuButtonsContextMenu)
}



clearMenuButtons()
addMenuButtonContextMenu()
addMenuButton('⚙️', e => {
    toggleMenuButtonContextMenu()
})
addMenuContextMenuButton(cache.get(`${dw.c.name}_manualmove`) ? 'Manual' : 'Auto', (e) => { 
    let manualMove = !cache.get(`${dw.c.name}_manualmove`)
    if(manualMove)
    {
        e.innerText = 'Manual'
    }
    else
    {
        e.innerText = 'Auto'
    }
    cache.set(`${dw.c.name}_manualmove`, manualMove)
})
addMenuContextMenuButton(cache.get(`showComputerVision`) ? 'VFX 🐵' : 'VFX 🙈', (e) => { 
    let showComputerVision = !cache.get(`showComputerVision`)
    if(showComputerVision)
    {
        e.innerText = 'VFX 🐵'
    }
    else
    {
        e.innerText = 'VFX 🙈'
    }
    cache.set(`showComputerVision`, showComputerVision)
})



















