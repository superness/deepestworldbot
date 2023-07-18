
let showComputerVision = dw.get("showComputerVision") ?? true
dw.set("showComputerVision", showComputerVision)

let optimalMonsterRange = dw.c.skills.filter(s => s).shift().range

let gridUpdatePeriod = 100
let moveUpdatePeriod = 100

const gridWidth = 24 // in-game units, this captures the area entities load in
const gridHeight = 16

const gridArrWidth = gridWidth * 2
const gridArrHeight = gridHeight * 2

// How far to stay away from hostiles  we can't beat
let scaryMonsterRadius = 4

// How wide to treat terrain for line of sight checks
let terrainThickness = 0.7

function sqr(x) { return x * x }
function dist2(v, w) { return sqr(v.x - w.x) + sqr(v.y - w.y) }
function distToSegmentSquared(p, v, w) {
    var l2 = dist2(v, w);
    if (l2 == 0) return dist2(p, v);
    var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist2(p, {
        x: v.x + t * (w.x - v.x),
        y: v.y + t * (w.y - v.y)
    });
}
function distToSegment(p, v, w) { return Math.sqrt(distToSegmentSquared(p, v, w)); }

function hasLineOfSight(target, from = dw.character, nonTraversableEntities = []) {
    if (dw.getTerrainAt({ l: dw.c.l, x: target.x, y: target.y }) > 0) {
        return false
    }

    for (let e of nonTraversableEntities) {
        // blocking entities treated as smaller than terrain
        let thickCheck = terrainThickness
        if (e.id) thickCheck = terrainThickness * 0.75

        // Similar to monsters, if we are standing in a non-traversable entity then 
        // only mark positions that move toward the entity as blocked so that there
        // are positions to move to away from the blocking entity
        if(dw.distance(e, dw.c) < thickCheck)
        {
            let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)

            let vecToEntity = { x: e.x - from.x, y: e.y - from.y }
            let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
            let sameDir = dot([vecToEntity.x, vecToEntity.y], [vecToSpot.x, vecToSpot.y]) < 0

            if (sameDir) continue
        }

        if (distToSegment(e, from, target) < thickCheck) {
            return false
        }
    }

    return true
}

// This algorithm creates a 'pill' shaped line between the character
// and the target if the pill includes a monster then it is not safe to move there
// as it would cause us to move close enough to pull a monster
function hasLineOfSafety(target, from = dw.character) {
    let hostlies = dw.findEntities(e => e.hostile && !isValidTarget(e))
    for (let monster of hostlies) {
        if (dw.targetId == monster.id) continue

        // If we are closer than scaryMonsteRadius to a hostile monster then this algorithm
        // will correctly mark every location on the grid as dangerous
        // Instead we mark every location that moves in the direction of the monster
        // as dangerous and otherwise do nothing, so that there are grid spots available
        // that move away from the monster
        if (dw.distance(monster, dw.c) <= scaryMonsterRadius) {
            let dot = (a, b) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n)

            let vecToMonster = { x: monster.x - from.x, y: monster.y - from.y }
            let vecToSpot = { x: target.x - from.x, y: target.y - from.y }
            let sameDir = dot([vecToMonster.x, vecToMonster.y], [vecToSpot.x, vecToSpot.y]) < 0

            if (sameDir) continue
        }

        // Check how close the line segment from the player to the spot
        // gets to the mosnter
        let distToTarget = distToSegment(monster, from, target)
        if (distToTarget < scaryMonsterRadius) {
            return false
        }
    }

    return true
}

function getSpotInfo(x, y, radius, monsters, nonTraversableEntities) {
    let nearMonsters = monsters.filter(m => dw.distance({ x: x, y: y }, m) < radius)
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()

    let spotValue = 50
    let spotType = 'open'

    if (!hasLineOfSight({ x: x, y: y }, dw.c, nonTraversableEntities)) {
        spotValue = 555
        spotType = 'obstructed'
    }

    if (!hasLineOfSafety({ x, y }, dw.c)) {
        spotValue = 555
        spotType = 'dangerous'
    }

    if (spotType == 'open') {
        for (let monster of nearMonsters) {
            let dist = dw.distance({ x: x, y: y }, monster)

            if (isValidTarget(monster) && (!target || target && target.id == monster.id)) {

                let delta = -10

                // Too close to a monster we can fight is bad
                if (dist < 2 && optimalMonsterRange > 2) {
                    delta += 80 * (1 - (dist / optimalMonsterRange))
                    if (spotType == 'open') {
                        spotType = 'fallback'
                    }
                }
                // In range of a range we can fight is good
                else if (dist < optimalMonsterRange) {
                    delta -= (40 * (dist / optimalMonsterRange))
                    if (spotType == 'open') {
                        spotType = 'preference'
                    }
                }

                if (dist < radius && !hasLineOfSight({ x: x, y: y }, monster, nonTraversableEntities)) {
                    delta += 100
                    spotType = 'partially-obstructed'
                }

                spotValue += delta
            }
            else {
                if (dist < scaryMonsterRadius && monster.hostile) {
                    spotValue += 500 * (1 - (dist / 8.0))
                    spotType = 'dangerous'
                }
                else {
                    // Too close to a monster we can fight is bad
                    if (dist < 2 && optimalMonsterRange > 2) {
                        spotValue += 80 * (1 - (dist / 2))
                        spotType = 'negative-value'
                    }
                }
            }
        }
    }

    return { positionValue: spotValue, type: spotType }
}

let visionGrid = new Array(gridArrWidth);
for (let i = 0; i < visionGrid.length; ++i) {
    visionGrid[i] = new Array(gridArrHeight)

    for (let j = 0; j < visionGrid[i].length; ++j) {
        visionGrid[i][j] = {}
    }
}

function getNonTraversableEntities() {
    let nonTraversableEntities = dw.findEntities(e => !e.ai && !e.player && !e.ore && !e.md.includes("portal"))
    let count = nonTraversableEntities.length

    // The non traversable entities are 1 tall and 2 wide so we create a duplicate
    // that is offset by x+(terrainThckness/2)
    for(let i = 0; i < count; ++i)
    {
        let e = nonTraversableEntities[i]
        let duplicate = {x:e.x+terrainThickness/2, y:e.y, id:e.id}
        nonTraversableEntities.push(duplicate)
    }

    // walk thru chunks and add everything that is not 0
    let chunkPropertyKeys = Object.keys(dw.chunks).filter(k => k.startsWith(dw.c.l))
    for (let k of chunkPropertyKeys) {
        let r = k.split('.')[2]
        let c = k.split('.')[1]
        for (let i = 0; i < 16; ++i) {
            for (let j = 0; j < 16; ++j) {
                if (dw.chunks[k][0][i][j] > 0) {
                    let x = r * 16 + j
                    let y = c * 16 + i

                    // Don't care about terrain out of the grid area
                    if (dw.distance({ x: x, y: y }, dw.c) > gridWidth) continue

                    nonTraversableEntities.push({ x: x + terrainThickness / 2, y: y + terrainThickness / 2 })
                }
            }
        }
    }

    return nonTraversableEntities
}

setInterval(function () {
    let monsters = dw.findEntities(e => e.ai)
    let nonTraversableEntities = getNonTraversableEntities()

    let gridLeft = Math.floor(dw.c.x - (gridWidth / 2))
    let gridTop = Math.floor(dw.c.y - (gridHeight / 2))

    let squareWidth = gridWidth / gridArrWidth
    let squareHeight = gridHeight / gridArrHeight

    squareWidth = gridWidth / gridArrWidth
    squareHeight = gridHeight / gridArrHeight

    // After mapping all the terrain get the spot's info
    for (let i = 0; i < gridArrWidth; ++i) {
        for (let j = 0; j < gridArrHeight; ++j) {
            let x = gridLeft + i * squareWidth - squareWidth / 2
            let y = gridTop + j * squareHeight - squareHeight / 2
            let spotInfo = getSpotInfo(x, y, scaryMonsterRadius, monsters, nonTraversableEntities)
            visionGrid[i][j] = { x: x, y: y, threat: spotInfo.positionValue, type: spotInfo.type }
        }
    }

}, gridUpdatePeriod)

function isValidTarget(entity, levelCheck = true) {
    if (entity.targetId == dw.c.id) return true

    if (getMonsterBattleScore(entity) > getMyBattleScore() * 1.3) return false
    if (levelCheck && entity.level < dw.c.level - 2 && entity.r === 0) return false

    return true
}

function getBestSkill(targetDistance) {
    let bestSkill = dw.c.skills.filter(s => s).shift()
    let mostDamage = getSkillDamage(bestSkill)

    for (let skill of dw.c.skills) {
        if (skill.range < targetDistance) continue

        let skillDamage = getSkillDamage(skill)
        if (mostDamage < skillDamage) {
            mostDamage = skillDamage
            bestSkill = skill
        }
    }

    return bestSkill
}

function getSkillDamage(skill) {
    if (!skill) return 0
    return skill.acidDmg + skill.coldDmg + skill.fireDmg + skill.elecDmg + skill.physDmg
}

let eleNameTypes = ['fire', 'elec', 'cold', 'acid']
let eleNameTypesRegex = new RegExp(eleNameTypes.join("|"), "i")

function getMonsterBattleScore(monster) {
    let isEle = eleNameTypesRegex.test(monster.md)
    return monster.hp * getMonsterDmg(monster) * (isEle ? 1.7 : 1)
}

function getMonsterDmg(monster) {
    let dmg = 19 * Math.pow(monster.hpMax / 95, 0.5)

    if (monster.r ?? 0 > 1) {
        dmg += (1 + monster.r * 0.5)
    }

    return dmg
}

function getMyDmg() {
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    let mySkillInfo = getBestSkill(dw.distance(target, dw.c)) ??
        dw.c.skills.filter(s => s.md).shift()
    return getSkillDamage(mySkillInfo)
}

function getMyBattleScore() {
    return getMyDmg() * dw.c.hp
}

// Movement logic
setInterval(function () {
    // Find the best spot to move to
    // lower value spots are better
    // a 15 or less is a preferred spot
    // a 30 is better than neutral
    let bestSpot = getGoodSpots(15).shift()
    bestSpot = bestSpot ?? getGoodSpots(30).shift()

    // If we didn't find a spot or we don't have a target in range and we have
    // moved to our last choice then choose another spot to search
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    if ((!bestSpot || !target) && dw.distance(moveToSpot, dw.c) < 0.2) {
        let searchOffset = 6

        if (!bestSpot) {
            // A 50 value spot is neurtal or 'safe'
            // pick the furthest one we can see that is within our search radius
            let goodSpots = getGoodSpots(50).filter(p => dw.distance(p, dw.c) < searchOffset)
            bestSpot = goodSpots.sort((a, b) => dw.distance(b, dw.c) - dw.distance(a, dw.c)).shift()
        }
    }

    moveToSpot = bestSpot ?? moveToSpot

    function getGoodSpots(range) {
        let goodSpots = []

        for (let i = 0; i < gridArrWidth; ++i) {
            for (let j = 0; j < gridArrHeight; ++j) {
                if (visionGrid[i][j].threat <= range) {
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
}, moveUpdatePeriod)


// Movement
let moveToSpot = { x: dw.c.x, y: dw.c.y }
let movingToSpot = { x: dw.c.x, y: dw.c.y }

setInterval(function () {

    if (!moveToSpot) return
    if (null == moveToSpot) return

    movingToSpot = movingToSpot ?? moveToSpot

    let dx = moveToSpot.x - movingToSpot.x
    let dy = moveToSpot.y - movingToSpot.y

    movingToSpot.x += dx * 4 / (1000 / moveUpdatePeriod)
    movingToSpot.y += dy * 4 / (1000 / moveUpdatePeriod)

    let dist = dw.distance(movingToSpot, dw.c)

    if (dist < 0.1) return

    if (dw.get(`${dw.c.name}_manualmove`) === true) return

    dw.emit('move', movingToSpot)
}, moveUpdatePeriod)

// Skills and targetting
setInterval(function () {

    if (dw.get(`${dw.name}_skipAttacks`) == true) return

    let target = dw.findClosestMonster(m => isValidTarget(m))

    // Target a monster that is targetting me when I have not engaged a monster already
    let monsterTargettingMe = dw.findClosestMonster(e => e.targetId == dw.c.id)
    if ((!target || target.hp == target.hpMax) && monsterTargettingMe) {
        target = monsterTargettingMe
    }

    if (!target) return

    dw.setTarget({ id: target.id })

    let skillUse = getBestSkill(dw.distance(target, dw.c))

    optimalMonsterRange = skillUse.range

    if (!dw.isSkillReady(skillUse.md) || dw.distance(target, dw.c) > skillUse.range) {
        return
    }

    dw.useSkill(skillUse.md, { id: target.id })
}, 10)








// UI
let gridTypeStyleMap =
{
    open: 'rgb(0, 100, 255, alpha)',
    obstructed: 'rgb(0, 0, 0, alpha)',
    'partially-obstructed': 'rgb(33, 33, 33, alpha)',
    preference: 'rgb(0, 255, 0, alpha)',
    fallback: 'rgb(245, 66, 239, alpha)',
    dangerous: 'rgb(207, 0, 41, alpha)',
    'negative-value': 'rgb(114, 0, 207, alpha)'
}
function getGridStyle(type, alpha) {
    let styleFormat = gridTypeStyleMap[type]

    if (!styleFormat) return 'red'

    return styleFormat.replace('alpha', alpha)
}

// Draw the value grid
dw.on("drawEnd", (ctx, cx, cy) => {
    if (!dw.get("showComputerVision")) {
        return
    }

    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))

    let squareWidth = gridWidth / gridArrWidth * 96
    let squareHeight = gridHeight / gridArrHeight * 96

    ctx.font = "12px arial";

    for (let i = 0; i < gridArrWidth; ++i) {
        for (let j = 0; j < gridArrHeight; ++j) {
            let threatLevel = Math.max(Math.min(visionGrid[i][j].threat, 100), 0)
            let alpha = threatLevel / 100.0 * 0.3

            ctx.fillStyle = getGridStyle(visionGrid[i][j].type, alpha)

            if (visionGrid[i][j] == moveToSpot) {
                ctx.fillStyle = `rgb(0, 255, 0, 0.5)`
            }

            let x = visionGrid[i][j].x * 96 - camOffsetX - squareWidth / 2
            let y = visionGrid[i][j].y * 96 - camOffsetY - squareHeight / 2

            ctx.beginPath()
            ctx.rect(x, y, squareWidth, squareHeight)
            ctx.fill()

            ctx.fillStyle = `rgb(0, 0, 0, 0.5)`

            ctx.fillText(Number(visionGrid[i][j].threat).toFixed(), x + squareWidth / 2, y + squareHeight / 2)
        }
    }

    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()

    ctx.lineWidth = 2
    if (moveToSpot) {
        drawLineToPOI(ctx, cx, cy, movingToSpot, `rgb(0, 0, 255, 0.5)`)
        drawLineToPOI(ctx, cx, cy, moveToSpot, `rgb(0, 255, 0, 0.5`)
    }
    drawLineToPOI(ctx, cx, cy, target, `rgb(245, 239, 66, 0.5)`)
})

function drawLineToPOI(ctx, cx, cy, target, style) {
    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))

    if (target) {
        ctx.fillStyle = style
        ctx.strokeStyle = style

        let spotx = target.x * 96 - camOffsetX - 5
        let spoty = target.y * 96 - camOffsetY - 5

        let playerx = dw.c.x * 96 - camOffsetX
        let playery = dw.c.y * 96 - camOffsetY

        ctx.beginPath()
        ctx.moveTo(playerx, playery)
        ctx.lineTo(spotx + 5, spoty + 5)
        ctx.stroke()

        ctx.beginPath()
        ctx.rect(spotx, spoty, 10, 10)
        ctx.fill()
    }
}








// Draw monster nameplates
dw.on("drawEnd", (ctx, cx, cy) => {
    ctx.strokeStyle = "green"
    ctx.fillStyle = "white";
    ctx.font = "18px arial";

    let monsters = dw.findEntities(e => e.ai)

    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))

    for (let monster of monsters) {
        let x = monster.x * 96 - camOffsetX
        let y = monster.y * 96 - camOffsetY - 60

        ctx.fillStyle = `rgb(0, 0, 0, 0.5)`

        ctx.beginPath()
        ctx.rect(x - 96 / 2, y, 96, 8)
        ctx.fill()

        ctx.strokeStyle = "black"
        ctx.fillStyle = "red"

        ctx.beginPath()
        ctx.rect(x - 96 / 2, y, 96 * monster.hp / monster.hpMax, 8)
        ctx.fill()

        ctx.fillStyle = `rgb(255, 255, 255, 0.3)`

        ctx.beginPath()
        ctx.rect(x - 96 / 2, y, 96, 4)
        ctx.fill()

        ctx.lineWidth = 2

        ctx.beginPath()
        ctx.rect(x - 96 / 2, y, 96, 8)
        ctx.stroke()

        ctx.strokeStyle = "black"
        ctx.fillStyle = "white"

        ctx.lineWidth = 4

        let dmg = Math.round(getMonsterDmg(monster))
        let myBattleScore = Math.round(getMyBattleScore())
        let battleScore = Math.round(getMonsterBattleScore(monster))
        let battleInfo = `${myBattleScore} 🗡️ ${battleScore}`
        let name = `${dmg}⚔️${monster.level} ${monster.md}`

        if (monster.r ?? 0 >= 1) {
            name += `💀`
            if (monster.r > 1) {
                name += monster.r
            }
        }

        if (battleScore < myBattleScore) {
            ctx.fillStyle = "white"
        }
        else if (isValidTarget(monster)) {
            ctx.fillStyle = "yellow"
        }
        else {
            ctx.fillStyle = "red"
        }

        ctx.font = "14px arial"
        ctx.textAlign = "center"
        ctx.strokeText(battleInfo, x, y - 8 - 20)
        ctx.fillText(battleInfo, x, y - 8 - 20)

        ctx.font = "18px arial"
        ctx.textAlign = "center"
        ctx.strokeText(name, x, y - 8)
        ctx.fillText(name, x, y - 8)

        ctx.lineWidth = 2
        ctx.font = "12px arial";
        ctx.strokeText(monster.hp, x, y + 8)
        ctx.fillText(monster.hp, x, y + 8)
    }
})
