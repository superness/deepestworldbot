let showComputerVision = dw.get("showComputerVision") ?? true
dw.set("showComputerVision", showComputerVision)
let optimalMonsterRange = dw.c.skills.filter((s) => s).shift().range
let optimalMonsterRangeBuffer = 0
let gridUpdatePeriod = 100
let gridWidth = 16
let gridHeight = 16
let gridArrWidth = gridWidth * 2
let gridArrHeight = gridHeight * 2
let scaryMonsterRadius = 5
let terrainThickness = 0.4
let entityThickness = 0.4
let targetZoneLevel = dw.c.level

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
function hasLineOfSafety(target, from = dw.character, dangerousEnemyPredicate = e => e.hostile && e.id != dw.targetId) {
    if (!target)
        return false
    let hostlies = dw.findEntities(dangerousEnemyPredicate)
    for (let monster of hostlies) {
        if (dw.targetId == monster.id)
            continue
        if (dw.distance(monster, dw.c) <= scaryMonsterRadius) {
            let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)
            let vecToMonster = { x: monster.x - from.x, y: monster.y - from.y }
            let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
            let sameDir = dot([vecToMonster.x, vecToMonster.y], [vecToSpot.x, vecToSpot.y]) < 0
            if (sameDir)
                continue
        }
        let monsterTest = { x: monster.x, y: monster.y }
        if (monster.id in entitiesDirMap && entitiesDirMap[monster.id].x) {
            monsterTest.x += entitiesDirMap[monster.id].x
            monsterTest.y += entitiesDirMap[monster.id].y
        }
        let distToTarget = distToSegment(monster, from, target)
        if (distToTarget < scaryMonsterRadius) {
            return false
        }
    }
    return true
}
function getSpotInfo(x, y, monsters, nonTraversableEntities) {
    let nearMonsters = monsters.filter((m) => dw.distance({ x, y }, m))
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    let spotValue = 50
    let spotType = "open"
    if (!hasLineOfSight({ x, y }, dw.c, nonTraversableEntities)) {
        spotValue = 555
        spotType = "obstructed"
    }
    if (!hasLineOfSafety({ x, y }, dw.c)) {
        spotValue = 555
        spotType = "dangerous"
    }
    if (spotType != "obstructed" && spotType != "dangerous") {
        for (let monster of nearMonsters) {
            let monsterTest = { x: monster.x, y: monster.y }
            if (monster.id in entitiesDirMap && entitiesDirMap[monster.id].x) {
                monsterTest.x += entitiesDirMap[monster.id].x
                monsterTest.y += entitiesDirMap[monster.id].y
            }
            let dist = Math.max(dw.distance({ x, y }, monster))
            if (dist < optimalMonsterRange + optimalMonsterRangeBuffer && isValidTarget(monster)) {
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
                let targetGooOtherGooCombat = target && target.md.toLowerCase().includes("goo") && monster.md.toLowerCase().includes("goo") && dw.c.combat
                let doAvoid = monster.hostile || targetGooOtherGooCombat
                let prevScaryRadius = scaryMonsterRadius
                if (targetGooOtherGooCombat && !monster.hostile) {
                    scaryMonsterRadius = 3
                }
                if (!hasLineOfSafety({x:x, y:y}, dw.c, e => e.id == monster.id) && doAvoid && hasLineOfSight({ x:x, y:y }, monster, nonTraversableEntities)) {
                    spotValue += 500
                    spotType = "dangerous"
                }
                scaryMonsterRadius = prevScaryRadius
            }
        }
    }
    return { positionValue: spotValue, type: spotType, lastUpdate: new Date() }
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
        let r = k.split(".")[2]
        let c = k.split(".")[1]
        for (let i = 0; i < 16; ++i) {
            for (let j = 0; j < 16; ++j) {
                if (dw.chunks[k][0][i][j] > 0) {
                    let x = r * 16 + j
                    let y = c * 16 + i
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
let fullGridProcessed = false
function* yieldVisionGridUpdatesOnOldSpots() {
    while (true) {
        let monsters = dw.findEntities((e) => e.ai)
        let nonTraversableEntities = getNonTraversableEntities()
        let visionGridEx = []
        for (let i = 0; i < gridArrWidth; ++i) {
            for (let j = 0; j < gridArrHeight; ++j) {
                let distPlayer = dw.distance(visionGrid[i][j], dw.c)
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
            let gridLeft2 = dw.c.x - gridWidth / 2
            let gridTop2 = dw.c.y - gridHeight / 2
            let squareWidth2 = gridWidth / gridArrWidth
            let squareHeight2 = gridHeight / gridArrHeight
            squareWidth2 = gridWidth / gridArrWidth
            squareHeight2 = gridHeight / gridArrHeight
            let x = gridLeft2 + spot.i * squareWidth2 - squareWidth2 / 2
            let y = gridTop2 + spot.j * squareHeight2 - squareHeight2 / 2
            let spotInfo = getSpotInfo(x, y, monsters, nonTraversableEntities)
            yield { i: spot.i, j: spot.j, data: { x, y, threat: spotInfo.positionValue, type: spotInfo.type, lastUpdate: new Date() } }
        }
        fullGridProcessed = true
    }
}
async function updateVisionGridOld() {
    let sw = new Stopwatch()
    sw.Start()
    let visionGridUpdateYielderOld = yieldVisionGridUpdatesOnOldSpots(0, 100)
    fullGridProcessed = false
    while (sw.ElapsedMilliseconds < gridUpdatePeriod && !fullGridProcessed) {
        let visionGridUpdate = visionGridUpdateYielderOld.next().value
        let gridLeft2 = dw.c.x - gridWidth / 2
        let gridTop2 = dw.c.y - gridHeight / 2
        let squareWidth2 = gridWidth / gridArrWidth
        let squareHeight2 = gridHeight / gridArrHeight
        squareWidth2 = gridWidth / gridArrWidth
        squareHeight2 = gridHeight / gridArrHeight
        let x = gridLeft2 + visionGridUpdate.i * squareWidth2 - squareWidth2 / 2
        let y = gridTop2 + visionGridUpdate.j * squareHeight2 - squareHeight2 / 2
        visionGrid[visionGridUpdate.i][visionGridUpdate.j] = { x, y, threat: visionGridUpdate.data.threat, type: visionGridUpdate.data.type, lastUpdate: new Date() }
    }
    
    await sleep(Math.max(1, gridUpdatePeriod - sw.ElapsedMilliseconds))
    updateVisionGridOld()
}
setTimeout(updateVisionGridOld, 100)


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
            if (hit.target in entitiesDirMap) {
                delete entitiesDirMap[hit.target]
            }
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
                if (dw.c.hp / dw.c.hpMax > 0.66) {
                    if (target.level >= targetZoneLevel) {
                        targetZoneLevel++
                        dw.log(`changing target zone level up to ${targetZoneLevel}`)
                    }
                }
                if (dw.c.hp / dw.c.hpMax < 0.33) {
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
    else
        optimalMonsterRangeBuffer = 0
}, 100)

function isValidTarget(entity, levelCheck = dw.c.mission === undefined) {
    if (entity.targetId == dw.c.id)
        return true
    if (!hasLineOfSight(entity, dw.c, getNonTraversableEntities()))
        return false
    if (getMonsterBattleScore(entity) > getMyBattleScore())
        return false
    let mpRequired = getMpRequiredToDefeatMonster(entity)
    if (dw.c.mp < mpRequired)
        return false
    let monsters = dw.findEntities((e) => e.ai && e.id != entity.id)
    for (let monster of monsters) {
        if (dw.distance(monster, entity) < 2) {
            return false
        }
    }
    return true
}

// Skill and damage calcuation
function getBestSkill(targetDistance) {
    let bestSkill = null
    let mostDamage = 0
    for (let skill of dw.c.skills) {
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

function getSkillDamage(skill) {
    if (!skill)
        return 0
    let skillDmg = skill.acid + skill.cold + skill.fire + skill.elec + skill.phys
    return skillDmg ?? 0
}

let eleNameTypes = ["fire", "elec", "cold", "acid"]
let eleNameTypesRegex = new RegExp(eleNameTypes.join("|"), "i")
function getMonsterBattleScore(monster, useFullHp = false) {
    // Without a better damage calculation method let's give elemental monsters a scarier battle score
    // assuming we are going to be weaker against ele dmg than phys
    let isEle = eleNameTypesRegex.test(monster.md) || monster.terrain != 1
    return (useFullHp ? monster.hpMax : monster.hp) * getMonsterDmg(monster) * (isEle ? 1.3 : 1)
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

function getMaxDamageDealtBeforeOom() {
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()

    if (!target) return Number.MAX_SAFE_INTEGER

    let myBestSkill = getBestSkill(dw.distance(target, dw.c))
    let mySkillInfo = myBestSkill ?? dw.c.skills.filter((s) => s.md).shift()

    if (dw.c.mpRegen > mySkillInfo.cost) return Number.MAX_SAFE_INTEGER

    if(dw.c.mp < mySkillInfo.cost) return 0

    let timeToOom = dw.c.mp / (mySkillInfo.cost - dw.c.mpRegen)
    let myDmg = getMyDmg()

    let maxPossibleDmg = timeToOom * myDmg
    return maxPossibleDmg
}

function getMyBattleScore(useMaxHp = false) {
    let hpScorePart = (useMaxHp ? dw.c.hpMax : dw.c.hp)

    let potentialScore = (getMyDmg() + 12) * hpScorePart
    let maxTargetLife = getMaxDamageDealtBeforeOom()
    let maxDmgScore = maxTargetLife * (getMyDmg())
    let dmgScorePart = Math.min(maxDmgScore, potentialScore)
    let battleScore = dmgScorePart

    if(isNaN(battleScore)) battleScore = 0

    return battleScore
}

function getMyMaximumBattleScore() {
    let potentialScore = ((getMyDmg() + 12) * dw.c.hpMax)

    if(isNaN(potentialScore)) potentialScore = 0

    return potentialScore
}

// Pick where to move
let moveUpdatePeriod = 30
let movePeriod = 100
let searchOffset = 2
let searchOffsetMission = 1
let recencyAvoidanceRadius = 5
let recentSpots = []
setInterval(function () {
    let bestSpot = getGoodSpots(15).shift()
    bestSpot = bestSpot ?? getGoodSpots(40).shift()
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    let moveToSpotIsClose = dw.distance(moveToSpot, dw.c) < 0.4 

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
    let distBestSpot = dw.distance(recentSpots[recentSpots.length - 1], dw.c)
    if (recentSpots.length == 0 || distBestSpot > recencyAvoidanceRadius) {
        let dx = 0
        let dy = 0
        if (recentSpots.length > 0) {
            dx = recentSpots[recentSpots.length - 1].x - dw.c.x
            dy = recentSpots[recentSpots.length - 1].y - dw.c.y
        }
        recentSpots.push({ x: dw.c.x + dx / 2, y: dw.c.y + dy / 2 })
    }
}, 300)

setInterval(function () {
    recentSpots.shift()
    while (recentSpots.length > 8) {
        recentSpots.shift()
    }
}, 4444)

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
            if (visionGrid[i][j].threat <= range && (now - visionGrid[i][j].lastUpdate < gridUpdatePeriod * 3)) {
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
    
    dw.setTarget({ id: target.id })
    let distTarget = dw.distance(target, dw.c)
    let skillUse = getBestSkill(distTarget)

    // No good skills to use
    if (!skillUse) {
        return
    }

    optimalMonsterRange = skillUse.range - 0.2
    if (dw.c.mp < (skillUse?.cost ?? 0) || !dw.isSkillReady(skillUse.md) || dw.distance(target, dw.c) > skillUse.range) {
        return
    }
    dw.useSkill(dw.c.skills.findIndex(s=>s===skillUse), { id: target.id })
}, 10)

// Track entity directions
let entitiesDirMap = {}
dw.on("diff", (entities) => {
    for (const data of entities) {
        const entity = dw.e.find((e) => e.id === data.id)
        let dx = data.x - entity.x
        let dy = data.y - entity.y
        const dir = {
            x: dx,
            y: dy
        }
        if (!(entity.id in entitiesDirMap)) {
            entitiesDirMap[entity.id] = dir
        }

        entitiesDirMap[entity.id] = dir
    }
})

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
    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))
    let monsters = dw.findEntities((e) => e.ai)
    ctx.lineWidth = 2
    ctx.strokeStyle = "red"
    for (let monster of monsters) {
        let x = monster.x * 96 - camOffsetX
        let y = monster.y * 96 - camOffsetY
        ctx.beginPath()
        ctx.arc(x, y, scaryMonsterRadius * 96, 0, 2 * Math.PI)
        ctx.stroke()
    }
    ctx.strokeStyle = "purple"
    for (let spot of recentSpots) {
        let x = spot.x * 96 - camOffsetX
        let y = spot.y * 96 - camOffsetY
        ctx.beginPath()
        ctx.arc(x, y, recencyAvoidanceRadius * 96, 0, 2 * Math.PI)
        ctx.stroke()
    }
})
dw.on("drawEnd", (ctx, cx, cy) => {
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
    ctx.strokeStyle = "green"
    ctx.fillStyle = "white"
    ctx.font = "18px arial"
    let monsters = dw.findEntities((e) => e.ai)
    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))
    let myBattleScore = Math.round(getMyBattleScore(false))
    for (let monster of monsters) {
        let smoothPos = monster.id in entititiesSmoothPosMap ? entititiesSmoothPosMap[monster.id] : monster
        let x2 = smoothPos.x * 96 - camOffsetX
        let y2 = smoothPos.y * 96 - camOffsetY - 60
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
        } else if (isValidTarget(monster)) {
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
    for (let eid of Object.keys(entitiesDirMap)) {
        let data = entitiesDirMap[eid]
        let entity = dw.findEntities((e) => e.id == eid).shift()
        if (!entity)
            continue
        if (entity == dw.c)
            continue
        drawLineToPOI(ctx, cx, cy, { x: entity.x + data.x, y: entity.y + data.y }, "black", entity)
    }
})

let lastTextUpdate = new Date()
dw.on("drawEnd", (ctx, cx, cy) => {
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

