// UI 
dw.on("drawEnd", (ctx, cx, cy) => {
    ctx.font = "18px arial";

    let monsters = dw.findEntities(e => e.ai)

    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))

    for (let monster of monsters) {
        let text = ctx.measureText(monster.md);

        let x = monster.x * 96 - camOffsetX
        let y = monster.y * 96 - camOffsetY - 60

        let dist = dw.distance(dw.c, monster)

        ctx.fillStyle = `rgb(0, 0, 0, 0.5)`;

        ctx.beginPath()
        ctx.rect(x - 96 / 2, y, 96, 8)
        ctx.fill()

        ctx.strokeStyle = "black"
        ctx.fillStyle = "red";

        ctx.beginPath()
        ctx.rect(x - 96 / 2, y, 96 * monster.hp / monster.hpMax, 8)
        ctx.fill()

        ctx.fillStyle = `rgb(255, 255, 255, 0.3)`;

        ctx.beginPath()
        ctx.rect(x - 96 / 2, y, 96, 4)
        ctx.fill()

        ctx.lineWidth = 2

        ctx.beginPath()
        ctx.rect(x - 96 / 2, y, 96, 8)
        ctx.stroke()

        ctx.strokeStyle = "black"
        ctx.fillStyle = "white";

        ctx.lineWidth = 4

        ctx.font = "18px arial";
        ctx.textAlign = "center";
        const name = `${monster.md} ${monster.level}${'+'.repeat(monster.r ?? 0)} ${Number(dist).toFixed(2)}`
        ctx.strokeText(name, x, y - 8)
        ctx.fillText(name, x, y - 8)

        ctx.lineWidth = 2
        ctx.font = "12px arial";
        ctx.strokeText(monster.hp, x, y + 8)
        ctx.fillText(monster.hp, x, y + 8)
    }
})