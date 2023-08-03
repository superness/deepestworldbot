
// RecordThat
class RecordThat {
    chunks = []
    mediaRecorder = null
    maxChunks = -1
    recording = false
    discardRequested = false
    constructor(canvas, maxChunks = -1) {
        this.maxChunks = maxChunks

        var videoStream = canvas.captureStream(30)
        this.mediaRecorder = new MediaRecorder(videoStream)
        
        var a = document.createElement("a")
        a.style = "display: none"
        
        document.body.appendChild(a)

        this.chunks = []
        this.mediaRecorder.ondataavailable = (e) => {
            console.log(this)
            console.log(this.chunks, e.data)
            this.chunks.push(e.data)
        }
        
        this.mediaRecorder.onstop = (e) => {
          if(this.chunks.length == 0)
          {
            return
          }
          if(this.discardRequested)
          {
            this.discardRequested = false
            this.chunks = []
            return
          }

          var blob = new Blob(this.chunks, { 'type' : 'video/mp4' })
          this.chunks = []
          var videoURL = URL.createObjectURL(blob)
        
          a.style = "display: none"
          a.href = videoURL
          a.download = `capture-${new Date().toJSON().replaceAll(':','-').replaceAll('.','-')}.mp4`
          a.click()
        
          window.URL.revokeObjectURL(videoURL)
        }
    }

    start() {
        this.recording = true
        this.mediaRecorder.start()
    }

    stop() {
        this.recording = false
        this.mediaRecorder.stop()
    }

    discard() {
        this.chunks = []
        this.discardRequested = true
        this.stop()
    }

    getIsRecording() {
        return this.recording
    }
}

// Hijack the canvas and create our RecordThat when we can
let recordThat = null

dw.on("drawEnd", (ctx, cx, cy) => {
    if(recordThat == null) {
        recordThat = new RecordThat(ctx.canvas)
    }
})

setInterval(() => {
    if(recordThat == null) return

    // If I am in combat or have a target then start recording if not recording
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()
    if(dw.c.combat || target)
    {
        if(!recordThat.getIsRecording())
        {
            recordThat.start()
        }
    }
    else
    {
        // If I am not in combat and don't have a target then discard recording
        if(recordThat.getIsRecording())
        {
            recordThat.discard()
        }
    }
}, 100)

// If I die then stop recording
dw.on("hit", (data) => {
    for (let hit of data) {
        if(hit.rip && hit.target == dw.c.id) {
            if(!recordThat.getIsRecording())
            {
                return
            }

            recordThat.stop()
        }
    }
})
