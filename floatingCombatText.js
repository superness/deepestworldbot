let floatingText = []

dw.on('hit', data => {
    for (let hit of data) {

        if(!hit.amount) continue
        
        // Add a floating text at the target for the amount
        let target = dw.findEntities((entity) => entity.id === hit.target).shift()
        let newText = { text: hit.amount, x: target.x, y: target.y, target: hit.target, life: 1.0, maxLife: 1.0 }

        if (target.id == dw.c.id) {
            newText.x -= 0.2
        }
        else {
            newText.x += 0.2
        }

        floatingText.push(newText)
    }
});




var lastTextUpdate = new Date();


// UI 
dw.on("drawEnd", (ctx, cx, cy) => {

    let camOffsetX = Math.round(cx * 96 - Math.floor(ctx.canvas.width / 2))
    let camOffsetY = Math.round(cy * 96 - Math.floor(ctx.canvas.height / 2))

    // floating text
    let curTextUpdate = new Date()
    var seconds = (curTextUpdate.getTime() - lastTextUpdate.getTime()) / 1000;
    lastTextUpdate = curTextUpdate

    //console.log(`seconds between updates ${seconds}`)
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

        ctx.font = `bold ${fontSize}px arial`
        ctx.strokeText(text.text, x, y)
        ctx.fillText(text.text, x, y)

        let textWidth = ctx.measureText(text.text).width

        const offscreen = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx = offscreen.getContext("2d")

        const offscreen2 = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx2 = offscreen2.getContext("2d")

        offCtx.fillStyle = 'blue'
        offCtx2.fillStyle = 'blue'

        let squarePath = new Path2D();
        squarePath.rect(x - textWidth / 2, y - fontSize * 0.2, textWidth, fontSize * 0.6)
        squarePath.closePath()

        // Set the clip to the square
        offCtx.clip(squarePath)

        offCtx.fillStyle = `rgb(245, 106, 32, 0.6)`
        offCtx.font = `bold ${fontSize}px arial`
        offCtx.fillText(text.text, x - textWidth / 2, y)

        let squarePath2 = new Path2D();
        squarePath2.rect(x - textWidth / 2, y - fontSize * 0.5, textWidth, fontSize)
        squarePath2.closePath()

        // Set the clip to the square
        offCtx2.clip(squarePath2)

        offCtx2.fillStyle = `rgb(245, 106, 32, 0.3)`
        offCtx2.font = `bold ${fontSize}px arial`
        offCtx2.fillText(text.text, x - textWidth / 2, y)

        if(offCtx.canvas.width > 0 && offCtx.canvas.height > 0)
        {
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
