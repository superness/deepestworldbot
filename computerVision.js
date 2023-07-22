// Computer vision
let showComputerVision = dw.get("showComputerVision") ?? true
dw.set("showComputerVision", showComputerVision)

let optimalMonsterRange = dw.c.skills.filter(s => s).shift().range

let gridUpdatePeriod = 7

let gridWidth = 24 // in-game units, this captures the area entities load in
let gridHeight = 16

let gridArrWidth = gridWidth * 2
let gridArrHeight = gridHeight * 2

// How far to stay away from hostiles  we can't beat
let scaryMonsterRadius = 5

// How wide to treat terrain for line of sight checks
let terrainThickness = 0.35
let entityThickness = 0.3

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

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
    if (!target) return false
    if (dw.getTerrainAt({ l: dw.c.l, x: target.x, y: target.y }) > 0) {
        return false
    }

    for (let e of nonTraversableEntities) {
        // skip the entity target, e.g. we don't care that the tree we are looking for is "blocking"
        if ("id" in e && "id" in target && e.id === target.id) continue;

        // blocking entities treated as smaller than terrain
        let thickCheck = terrainThickness
        if (e.id) thickCheck = entityThickness

        // Similar to monsters, if we are standing in a non-traversable entity then 
        // only mark positions that move toward the entity as blocked so that there
        // are positions to move to away from the blocking entity
        if (dw.distance(e, dw.c) < thickCheck) {
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
// and a target location if the pill area includes a monster then it is not safe to move there
// as it would cause us to move close enough to pull a monster
function hasLineOfSafety(target, from = dw.character) {
    if (!target) return false
    let hostlies = dw.findEntities(e => dw.c.mission == undefined && e.hostile && !isValidTarget(e))
    for (let monster of hostlies) {
        if (dw.targetId == monster.id) continue

        // If we are closer than scaryMonsterRadius to a hostile monster then this algorithm
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

        let monsterTest = {x:monster.x, y:monster.y}
        if (monster.id in entitiesDirMap && entitiesDirMap[monster.id].x) {

            monsterTest.x += entitiesDirMap[monster.id].x
            monsterTest.y += entitiesDirMap[monster.id].y
        }
        
        distToTarget = distToSegment(monsterTest, from, target)
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
            let monsterTest = { x: monster.x, y: monster.y }

            if (monster.id in entitiesDirMap && entitiesDirMap[monster.id].x) {

                monsterTest.x += entitiesDirMap[monster.id].x
                monsterTest.y += entitiesDirMap[monster.id].y
            }

            let dist = Math.max(dw.distance({ x: x, y: y }, monster))

            if (dw.c.mission == undefined && monster.level < dw.c.level - 2 && !monster.hostile) continue

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

                if (dist < radius && !hasLineOfSight({ x: x, y: y }, monsterTest, nonTraversableEntities)) {
                    delta += 100
                    spotType = 'partially-obstructed'
                }

                spotValue += delta
            }
            else {
                if (dist < scaryMonsterRadius && monster.hostile) {
                    spotValue += 500
                    spotType = 'dangerous'
                }
            }
        }
    }

    return { positionValue: spotValue, type: spotType, lastUpdate: new Date() }
}

function getNonTraversableEntities() {
    let nonTraversableEntities = []
    let blockingEntities = dw.findEntities(e => !e.ai && !e.player && !e.ore && !e.md.includes("portal"))

    let count = blockingEntities.length
    for (let i = 0; i < count; ++i) {
        let e = blockingEntities[i]

        let hitbox = dw.md.items[e.md].hitbox ?? {w:0, h:0}

        nonTraversableEntities.push({ x: e.x - hitbox.w / 2, y: e.y - hitbox.h, id: e.id })
        nonTraversableEntities.push({ x: e.x - hitbox.w / 2, y: e.y - hitbox.h / 2, id: e.id })
        nonTraversableEntities.push({ x: e.x, y: e.y - hitbox.h, id: e.id })
        nonTraversableEntities.push({ x: e.x, y: e.y - hitbox.h / 2, id: e.id })
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
                    if (x < dw.c.x - gridWidth / 2 || x > dw.c.x + gridWidth / 2 ||
                        y < dw.c.y - gridHeight / 2 || y > dw.c.y + gridHeight / 2) {
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

// convert visionGrid into visionSquares
// make sure it works still
// make methods to slice sections of squares into more or less smaller or bigger squares
// upate the collection of squares
// render the collection of squares
let visionGrid = new Array(gridArrWidth);

let gridLeft = dw.c.x - (gridWidth / 2)
let gridTop = dw.c.y - (gridHeight / 2)

let squareWidth = gridWidth / gridArrWidth
let squareHeight = gridHeight / gridArrHeight

squareWidth = gridWidth / gridArrWidth
squareHeight = gridHeight / gridArrHeight

for (let i = 0; i < visionGrid.length; ++i) {
    visionGrid[i] = new Array(gridArrHeight)

    for (let j = 0; j < visionGrid[i].length; ++j) {
        let x = gridLeft + i * squareWidth - squareWidth / 2
        let y = gridTop + j * squareHeight - squareHeight / 2

        visionGrid[i][j] = { x: x, y: y, threat: 555, type: 'dangerous', lastUpdate: new Date() }
    }
}

function* yieldVisionGridUpdatesOnOldSpots(minRange = 0, maxRange = 100) {
    while (true) {
        let monsters = dw.findEntities(e => e.ai)
        let nonTraversableEntities = getNonTraversableEntities()

        let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()

        let visionGridEx = []
        for (let i = 0; i < gridArrWidth; ++i) {
            for (let j = 0; j < gridArrHeight; ++j) {

                let distPlayer = dw.distance(visionGrid[i][j], dw.c)

                let distUse = distPlayer

                if(moveToSpot && moveToSpot.x)
                {
                    let distMoveTo = dw.distance(visionGrid[i][j], moveToSpot)
                    distUse = Math.min(distUse, distMoveTo)
                }

                if(target)
                {
                    let distMonster = dw.distance(visionGrid[i][j], target)
                    distUse = Math.min(distMonster, distUse)
                }

                distUse *= visionGrid[i][j].threat

                visionGridEx.push({i:i, j:j, data:visionGrid[i][j], dist:distUse})
            }
        }

        let now = new Date()
        visionGridEx.sort((a, b) => ((now.getTime() - b.data.lastUpdate.getTime()) / b.dist) - ((now.getTime() - a.data.lastUpdate.getTime()) / a.dist))

        for(let spot of visionGridEx)
        {
            now = new Date()

            let gridLeft = dw.c.x - (gridWidth / 2)
            let gridTop = dw.c.y - (gridHeight / 2)
    
            let squareWidth = gridWidth / gridArrWidth
            let squareHeight = gridHeight / gridArrHeight
    
            squareWidth = gridWidth / gridArrWidth
            squareHeight = gridHeight / gridArrHeight

            let x = gridLeft + spot.i * squareWidth - squareWidth / 2
            let y = gridTop + spot.j * squareHeight - squareHeight / 2

            let spotInfo = getSpotInfo(x, y, scaryMonsterRadius, monsters, nonTraversableEntities)

            yield { i: spot.i, j: spot.j, data: { x: x, y: y, threat: spotInfo.positionValue, type: spotInfo.type, lastUpdate: new Date() } }
        }
    }
}

async function updateVisionGridOld() {
    let sw = new Stopwatch()
    sw.Start()

    // Update spots that haven't had updates recently
    let visionGridUpdateYielderOld = yieldVisionGridUpdatesOnOldSpots(0, 100)
    while(sw.ElapsedMilliseconds < gridUpdatePeriod) {
        let visionGridUpdate = visionGridUpdateYielderOld.next().value

        let gridLeft = dw.c.x - (gridWidth / 2)
        let gridTop = dw.c.y - (gridHeight / 2)

        let squareWidth = gridWidth / gridArrWidth
        let squareHeight = gridHeight / gridArrHeight

        squareWidth = gridWidth / gridArrWidth
        squareHeight = gridHeight / gridArrHeight

        let x = gridLeft + visionGridUpdate.i * squareWidth - squareWidth / 2
        let y = gridTop + visionGridUpdate.j * squareHeight - squareHeight / 2
        
        visionGrid[visionGridUpdate.i][visionGridUpdate.j] = { x: x, y: y, threat: visionGridUpdate.data.threat, type: visionGridUpdate.data.type, lastUpdate: new Date() }
    }

    await sleep(1)

    updateVisionGridOld()
}
setTimeout(updateVisionGridOld, 100)



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

    let gridLeft = (dw.c.x - gridWidth / 2) * 96 - camOffsetX - squareWidth / 2
    let gridTop = (dw.c.y - gridHeight / 2) * 96 - camOffsetY - squareHeight / 2

    ctx.font = "12px arial";

    let now = new Date()
    for (let i = 0; i < gridArrWidth; ++i) {
        for (let j = 0; j < gridArrHeight; ++j) {
            let threatLevel = Math.max(Math.min(visionGrid[i][j].threat, 100), 0)
            let alpha = threatLevel / 100.0 * 0.3

            ctx.fillStyle = getGridStyle(visionGrid[i][j].type, 1)

            let x = visionGrid[i][j].x * 96 - camOffsetX
            let y = visionGrid[i][j].y * 96 - camOffsetY

            if(x < -1 * squareWidth || x > ctx.canvas.width || y < -1 * squareHeight || y > ctx.canvas.width) continue

            let sizeMulti = Math.max(0, (1000 - (now - visionGrid[i][j].lastUpdate)) / 1000)
            let widthUse = squareWidth / 2 * sizeMulti
            let heightUse = squareHeight / 2 * sizeMulti

            ctx.beginPath()
            ctx.rect(x + (squareWidth - widthUse) / 2, y + (squareHeight - heightUse) / 2, widthUse, heightUse)
            ctx.fill()

            ctx.fillStyle = `rgb(0, 0, 0, 0.5)`
        }
    }

    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()

    ctx.lineWidth = 2
    if (moveToSpot) {
        drawLineToPOI(ctx, cx, cy, moveToSpot, `rgb(0, 255, 0, 0.5`)
        drawLineToPOI(ctx, cx, cy, movingToSpot, `rgb(0, 0, 255, 0.5)`)
    }
    drawLineToPOI(ctx, cx, cy, target, `rgb(245, 239, 66, 0.5)`)
})

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

// Draw monster nameplates
dw.on("drawEnd", (ctx, cx, cy) => {
    ctx.strokeStyle = "green"
    ctx.fillStyle = "white";
    ctx.font = "18px arial";

    let monsters = dw.findEntities(e => e.ai)

    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))

    let myBattleScore = Math.round(getMyBattleScore(false))

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
        let battleScore = Math.round(getMonsterBattleScore(monster))
        let name = `🎖️${monster.level} ${monster.md}`

        if (monster.r ?? 0 >= 1) {
            name += `💀`
            if (monster.r > 1) {
                name += monster.r
            }
        }

        ctx.font = "14px arial"
        ctx.textAlign = "center"
        ctx.strokeText('🗡️', x, y - 8 - 20)
        ctx.fillText('🗡️', x, y - 8 - 20)

        // draw dmg
        ctx.fillStyle = "orange"
        ctx.textAlign = "right"
        let textWidth = ctx.measureText(dmg).width
        ctx.strokeText(dmg, x - textWidth, y - 8 - 20)
        ctx.fillText(dmg, x - textWidth, y - 8 - 20)

        ctx.fillStyle = "white"
        if (battleScore < myBattleScore * 0.7) {
            ctx.fillStyle = "white"
        }
        else if (isValidTarget(monster)) {
            ctx.strokeStyle = "orange"
        }
        else {
            ctx.strokeStyle = "red"
        }

        // draw score
        ctx.textAlign = "left"
        textWidth = ctx.measureText('x').width + 5
        ctx.strokeText(battleScore, x + textWidth, y - 8 - 20)
        ctx.fillText(battleScore, x + textWidth, y - 8 - 20)

        ctx.font = "18px arial"
        ctx.textAlign = "center"
        ctx.strokeText(name, x, y - 8)
        ctx.fillText(name, x, y - 8)

        ctx.lineWidth = 2
        ctx.font = "12px arial";
        ctx.strokeText(monster.hp, x, y + 8)
        ctx.fillText(monster.hp, x, y + 8)
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

    if(dw.c.hp / dw.c.hpMax < 0.66)
    {
        ctx.fillStyle = "orange"
    }

    if(dw.c.hp / dw.c.hpMax < 0.33)
    {
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

    ctx.font = "12px arial";
    ctx.fillStyle = "white"
    ctx.strokeText(dw.c.hp, x, y + 12)
    ctx.fillText(dw.c.hp, x, y + 12)

    let name = `🎖️${dw.c.level} ${dw.c.name.toLowerCase()}`

    ctx.font = "20px arial"
    ctx.textAlign = "center"
    ctx.strokeText('🗡️', x, y - 8 - 30)
    ctx.fillText('🗡️', x, y - 8 - 30)
    ctx.font = "16px arial"

    // draw dmg
    ctx.fillStyle = "orange"
    ctx.textAlign = "right"
    let dmg = getSkillDamage(getBestSkill(5))
    let textWidth = ctx.measureText('x').width + 8
    ctx.strokeText(dmg, x - textWidth, y - 8 - 30)
    ctx.fillText(dmg, x - textWidth, y - 8 - 30)

    ctx.fillStyle = "white"

    // draw score
    myBattleScore = Math.round(getMyBattleScore(true))
    ctx.textAlign = "left"
    textWidth = ctx.measureText('x').width + 8
    ctx.strokeText(myBattleScore, x + textWidth, y - 8 - 30)
    ctx.fillText(myBattleScore, x + textWidth, y - 8 - 30)

    ctx.font = "24px arial"
    ctx.textAlign = "center"
    ctx.strokeText(name, x, y - 12)
    ctx.fillText(name, x, y - 12)
})


// Entity directions
dw.on("drawEnd", (ctx, cx, cy) => {
    for (let eid of Object.keys(entitiesDirMap)) {

        let data = entitiesDirMap[eid]
        let entity = dw.findEntities(e => e.id == eid).shift()

        if (!entity) continue
        if (entity == dw.c) continue

        drawLineToPOI(ctx, cx, cy, { x: entity.x + data.x, y: entity.y + data.y }, 'black', entity)
    }
})



// Floating combat text
let floatingText = []

dw.on('hit', data => {
    for (let hit of data) {

        if (!hit.amount) continue

        // Add a floating text at the target for the amount
        let target = dw.findEntities((entity) => entity.id === hit.target).shift()
        let newText = { text: hit.amount, x: target.x, y: target.y, target: hit.target, life: 1.3, maxLife: 1.3 }

        if (target.id == dw.c.id) {
            newText.x -= 1
            newText.y -= 1
        }

        floatingText.push(newText)

        // if the player died then reset moveToSpot to spawn
        if (hit.rip && hit.target == dw.c.id) {
            moveToSpot = dw.c.spawn
            dw.setTarget(null)
        }
        else if (hit.rip) {
            if (hit.target in entitiesDirMap) {
                delete entitiesDirMap[hit]
            }
        }
    }
});

var lastTextUpdate = new Date();
dw.on("drawEnd", (ctx, cx, cy) => {
    ctx.strokeStyle = "green"
    ctx.fillStyle = "white";
    ctx.font = "18px arial";

    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))

    let curTextUpdate = new Date()
    var seconds = (curTextUpdate.getTime() - lastTextUpdate.getTime()) / 1000;
    lastTextUpdate = curTextUpdate

    for (let text of floatingText) {
        if (text.life < 0) continue

        let x = text.x * 96 - camOffsetX
        let y = text.y * 96 - camOffsetY

        ctx.lineWidth = 4
        ctx.fillStyle = 'black'
        ctx.strokeStyle = `rgb(255, 0, 0, 0.8)`

        ctx.fillStyle = 'white'

        if (text.target == dw.c.id) {
            ctx.lineWidth = 2
            ctx.strokeStyle = `rgb(0, 0, 0, 0.8)`
            ctx.fillStyle = 'red'
        }

        let fontSize = 28 * combatTextTween(text.life / text.maxLife)

        ctx.textAlign = "left"
        ctx.font = `bold ${fontSize}px arial`
        ctx.strokeText(text.text, x, y)
        ctx.fillText(text.text, x, y)

        let textWidth = ctx.measureText(text.text).width

        const offscreen = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx = offscreen.getContext("2d")

        const offscreen2 = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx2 = offscreen2.getContext("2d")

        offCtx.textAlign = "left"
        offCtx2.textAlign = "left"

        offCtx.fillStyle = 'blue'
        offCtx2.fillStyle = 'blue'

        let squarePath = new Path2D();
        squarePath.rect(x, y - fontSize * 0.2, textWidth, fontSize * 0.6)
        squarePath.closePath()

        // Set the clip to the square
        offCtx.clip(squarePath)

        offCtx.fillStyle = `rgb(245, 106, 32, 0.6)`
        offCtx.font = `bold ${fontSize}px arial`
        offCtx.fillText(text.text, x, y)

        let squarePath2 = new Path2D();
        squarePath2.rect(x, y - fontSize * 0.5, textWidth, fontSize)
        squarePath2.closePath()

        // Set the clip to the square
        offCtx2.clip(squarePath2)

        offCtx2.fillStyle = `rgb(245, 106, 32, 0.3)`
        offCtx2.font = `bold ${fontSize}px arial`
        offCtx2.fillText(text.text, x - textWidth / 2, y)

        if (offCtx.canvas.width > 0 && offCtx.canvas.height > 0) {
            ctx.drawImage(offscreen2.transferToImageBitmap(), 0, 0)
            ctx.drawImage(offscreen.transferToImageBitmap(), 0, 0)
        }

        text.life -= seconds
    }

    floatingText = floatingText.filter(t => t.life > 0)
})

function combatTextTween(x) {
    return x * easeInOutElastic(x) + (1.0 - x) * easeInOutQuint(x)
}

function easeOutExpo(x) {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

function easeInBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;

    return c3 * x * x * x - c1 * x * x;
}

function easeInExpo(x) {
    return x === 0 ? 0 : Math.pow(2, 10 * x - 10);
}

function easeInQuint(x) {
    return x * x * x * x * x;
}

function easeOutQuint(x) {
    return 1 - Math.pow(1 - x, 5);
}

function easeInOutElastic(x) {
    const c5 = (2 * Math.PI) / 4.5;

    return x === 0
        ? 0
        : x === 1
            ? 1
            : x < 0.5
                ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
                : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1;
}

function easeInOutQuint(x) {
    return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

function isValidTarget(entity, levelCheck = false) {
    if (entity.targetId == dw.c.id) return true

    if (getMonsterBattleScore(entity) > getMyBattleScore()) return false
    if (levelCheck && entity.level < dw.c.level - 2 && entity.r === 0 && !entity.hostile) return false
    if (entity.hostile && ((levelCheck && entity.level < dw.c.level - 4) || entity.x < dw.c.x)) return false

    let mpRequired = ((entity.hp / getMyDmg()) + 1) * getBestSkill(6).cost 
    if(dw.c.mp < mpRequired) return false

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
    return (monster.hp) * getMonsterDmg(monster) * (isEle ? 1.7 : 1)
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

function getMyBattleScore(useMaxHp = false) {
    return getMyDmg() * ((useMaxHp ? dw.c.hpMax : dw.c.hp) + (useMaxHp ? dw.c.mpMax : dw.c.mp))
}

function getGridSpot(x, y) {
    let squareWidth = gridWidth / gridArrWidth
    let squareHeight = gridHeight / gridArrHeight

    for (let i = 0; i < visionGrid.length; ++i) {
        for (let j = 0; j < visionGrid[i].length; ++j) {
            let spot = visionGrid[i][j]
            if (x > spot.x && x < spot.x + squareWidth &&
                y > spot.y && y < spot.y + squareHeight) {
                return spot
            }
        }
    }

    return null
}








// // Movement logic
let moveUpdatePeriod = 100
let searchOffset = 8
let searchOffsetMission = 4
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
    if (((!bestSpot || !target) && (dw.distance(moveToSpot, dw.c) < 0.2) ||
        !hasLineOfSafety(moveToSpot, dw.c) ||
        !hasLineOfSight(moveToSpot, dw.c, getNonTraversableEntities()))) {

        if (!bestSpot) {
            // A 50 value spot is neurtal or 'safe'
            // pick the furthest one we can see that is within our search radius
            //let offsetUse = dw.c.mission == undefined ? searchOffset : searchOffsetMission
            let goodSpots = getGoodSpots(50)
            let goodFartherSpots = goodSpots.filter(p => dw.distance(p, dw.c) > searchOffset)
            let goodFarSpots = goodSpots.filter(p => dw.distance(p, dw.c) > searchOffsetMission)
            let goodESpots = goodFarSpots.filter(p => p.x > dw.c.x)
            let goodSESpots = goodFarSpots.filter(p => p.x > dw.c.x && p.y > dw.c.y)

            bestSpot = goodSESpots.shift() ?? goodESpots.shift() ?? goodFartherSpots.shift() ?? goodFarSpots.shift() ?? goodSpots.shift()

            if (dw.c.mission) {
                bestSpot = goodFartherSpots.shift() ?? goodFarSpots.shift() ?? goodSpots.shift()
            }
        }
    }

    moveToSpot = bestSpot ?? moveToSpot
    //console.log('setting spot to', bestSpot)
}, moveUpdatePeriod)


function getGoodSpots(range) {
    let goodSpots = []
    let now = new Date()

    for (let i = 0; i < gridArrWidth; ++i) {
        for (let j = 0; j < gridArrHeight; ++j) {
            if (visionGrid[i][j].threat <= range && (now - visionGrid[i][j].lastUpdate) < gridUpdatePeriod) {
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

// Movement
let moveToSpot = { x: dw.c.x, y: dw.c.y }
let movingToSpot = { x: dw.c.x, y: dw.c.y }

setInterval(function () {
    if (!moveToSpot) return
    if (null == moveToSpot) return

    if (dw.get(`${dw.c.name}_manualmove`) === true) return

    movingToSpot = movingToSpot ?? moveToSpot

    let dx = moveToSpot.x - movingToSpot.x
    let dy = moveToSpot.y - movingToSpot.y

    movingToSpot.x += dx * 4 / (1000 / moveUpdatePeriod)
    movingToSpot.y += dy * 4 / (1000 / moveUpdatePeriod)

    let dist = dw.distance(movingToSpot, dw.c)

    if (dist < 0.1) return

    //console.log(moveToSpot, movingToSpot)
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

    skillUse = skillUse ?? dw.c.skills.filter(s => s.md == mySkill).shift()

    optimalMonsterRange = skillUse.range - 0.06

    if (!dw.isSkillReady(skillUse.md) || dw.distance(target, dw.c) > skillUse.range) {
        return
    }

    dw.useSkill(skillUse.md, { id: target.id })
}, 10)


// Tracking entity movement directions
let entitiesDirMap = {}
dw.on('diff', entities => {
    for (const data of entities) {
        const entity = dw.e.find(e => e.id === data.id)
        const len = dw.distance(data, entity)
        const dir = {
            x: (data.x - entity.x) / len,
            y: (data.y - entity.y) / len
        };

        if (!(entity.id in entitiesDirMap)) {
            entitiesDirMap[entity.id] = dir
        }

        entitiesDirMap[entity.id] = dir
    }
})


function Stopwatch() {
    var sw = this;
    var start = null;
    var stop = null;
    var isRunning = false;

    sw.__defineGetter__("ElapsedMilliseconds", function () {
        return (isRunning ? new Date() : stop) - start;
    });

    sw.__defineGetter__("IsRunning", function () {
        return isRunning;
    });

    sw.Start = function () {
        if (isRunning)
            return;

        start = new Date();
        stop = null;
        isRunning = true;
    }

    sw.Stop = function () {
        if (!isRunning)
            return;

        stop = new Date();
        isRunning = false;
    }

    sw.Reset = function () {
        start = isRunning ? new Date() : null;
        stop = null;
    }

    sw.Restart = function () {
        isRunning = true;
        sw.Reset();
    }
}
