
dw.on("drawEnd", (ctx, cx, cy) => {
    ctx.strokeStyle = "green"
    ctx.fillStyle = "white"
    ctx.font = "18px arial"
    let monsters = dw.findEntities((e) => e.ai)
    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))
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
        let name2 = `🎖️${monster.level} ${monster.md}`
        if (monster.r ?? 0 >= 1) {
            name2 += `💀`
            if (monster.r > 1) {
                name2 += monster.r
            }
        }
        ctx.fillStyle = "white"
        ctx.textAlign = "left"
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
        let name2 = `🎖️${pc.level} ${pc.name}`
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
    let name = `🎖️${dw.c.level} ${dw.c.name.toLowerCase()}`
    ctx.fillStyle = "white"
    ctx.font = "24px arial"
    ctx.textAlign = "center"
    ctx.strokeText(name, x, y - 12)
    ctx.fillText(name, x, y - 12)
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
