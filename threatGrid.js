const canFightList = ['greenGoo', 'spikedGreenGoo', 'giantSpikedGreenGoo', 'giantGreenGoo']
let showThreatGrid = true






function getTerrainInStraightLine(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = dw.distance(p1, p2);
    const numSteps = 10

    const terrainArray = [];

    for (let i = 0; i <= numSteps; i++) {
        const x = p1.x + (dx * (i / numSteps));
        const y = p1.y + (dy * (i / numSteps));

        const terrain = dw.getTerrainAt({ l: p1.l, x, y });
        terrainArray.push(terrain);
    }

    //   console.log(terrainArray);

    return terrainArray;
}

function hasLineOfSight(target, from = dw.character) {
    const straightPath = getTerrainInStraightLine(from, target);
    return !straightPath.some((x) => x > 0 /* Air / Walkable */);
}


function getThreatLevel(x, y, radius, monsters) {
    // monsters in the area that we can beat reduce threat
    // scary monsters that will kill us increase threat

    let nearMonsters = monsters.filter(m => dw.distance({ x: x, y: y }, m) < radius)

    let threatLevel = 50

    for (let monster of nearMonsters) {
        let dist = dw.distance({ x: x, y: y }, monster)
        if (canFightList.includes(monster.md) && monster.hpMax < dw.c.hpMax + 200) {
            //console.log(dist)
            let delta = -10

            // In range of a range we can fight is good
            if (dist < 3) {
                delta -= (30 * (dist / 3))
            }

            // Too close to a monster we can fight is bad
            if (dist < 2) {
                delta += 50
            }

            if (!hasLineOfSight({ x: x, y: y })) {
                delta = 50
            }

            if (!hasLineOfSight({ x: x, y: y }, monster)) {
                delta = 50
            }

            threatLevel += delta
        }
        else {
            if (dist < 6) {
                threatLevel += 50
            }
        }
    }

    return threatLevel
}

const gridWidth = 30
const gridHeight = 30

const screenGridWidth = 3000;
const screenGridHeight = 3000;

const gridArrWidth = 50
const gridArrHeight = 50

let threatGrid = new Array(gridArrWidth);
for (let i = 0; i < threatGrid.length; ++i)
{
    threatGrid[i] = new Array(gridArrHeight)

    for(let j = 0; j < threatGrid[i].length; ++j)
    {
        threatGrid[i][j] = {}
    }
}

setInterval(function () {


    let pxLeft = dw.c.x - (gridWidth / 2)
    let pxBottom = dw.c.y - (gridHeight / 2)
    
    let pxdx = gridWidth / gridArrWidth
    let pxdy = gridHeight / gridArrHeight

    // From dw.c.x - w/2 to dw.c.x + w/2
    // set threat level near the that point 
    let monsters = dw.findEntities(e => e.ai)

    for(let i = 0; i < gridArrWidth; ++i)
    {
        for(let j = 0; j < gridArrHeight; ++j)
        {
            let x = pxLeft + i * pxdx - pxdx / 2
            let y = pxBottom + j * pxdy - pxdy / 2
            threatGrid[i][j] = {x:x, y:y, threat:getThreatLevel(x, y, 5, monsters)}
        }
    }
}, 100)

let moveToSpot = {}


setInterval(function(){
    // find the best spot to move to
    let goodSpots = []
    for(let i = 0; i < gridArrWidth; ++i)
    {
        for(let j = 0; j < gridArrHeight; ++j)
        {
            if(threatGrid[i][j].threat < 20)
            {
                goodSpots.push(threatGrid[i][j])
            }
        }
    }

    goodSpots.sort(function(a, b)
    {
        let da = dw.distance(dw.c, a)
        let db = dw.distance(dw.c, b)

        return da - db
    })

    let bestSpot = goodSpots.shift()
    moveToSpot = bestSpot

    dw.emit('move', bestSpot)

}, 100)




























// UI 
dw.on("drawEnd", (ctx, cx, cy) => {
    if(!showThreatGrid) 
    {
        return
    }

    // threat grid
    let pxLeft = ctx.canvas.width / 2 - (screenGridWidth / 2) 
    let pxTop = ctx.canvas.height / 2 - (screenGridHeight / 2) 

    let pxdx = screenGridWidth / gridArrWidth
    let pxdy = screenGridHeight / gridArrHeight


    let squareWidth = Math.max(pxdx, pxdy)

    for(let i = 0; i < gridArrWidth; ++i)
    {
        for(let j = 0; j < gridArrHeight; ++j)
        {
            let threatLevel = Math.max(Math.min(threatGrid[i][j].threat, 100), 0)
            let alpha = threatLevel / 100.0 * 0.3
            ctx.fillStyle =  `rgb(255, 0, 0, ${alpha})`

            if(threatGrid[i][j] == moveToSpot)
            {
                ctx.fillStyle =  `rgb(0, 255, 0, 0.5)`
            }
            
            let x = pxLeft + i * pxdx - pxdx / 2
            let y = pxTop + j * pxdy - pxdy / 2

            ctx.beginPath()
            ctx.rect(x, y, squareWidth, squareWidth)
            ctx.fill()

            ctx.fillStyle = `rgb(0, 0, 0, 0.5)`
            
            ctx.fillText(Number(threatGrid[i][j].threat).toFixed(), x + pxdx / 2, y + pxdy / 2)
        }
    }    
})
