

// RecordThat
class RecordThat {
    chunks = []
    mediaRecorder = null
    recording = false
    discardRequested = false
    stopRequested = false
    startRequested = false
    name = 'empty'
    constructor(canvas, name) {
        this.name = name

        var videoStream = canvas.captureStream(10)
        this.mediaRecorder = new MediaRecorder(videoStream)
        
        var a = document.createElement("a")
        a.style = "display: none"
        
        document.body.appendChild(a)

        this.chunks = []
        this.mediaRecorder.ondataavailable = (e) => {
            this.chunks.push(e.data)


            if(this.stopRequested) {
                this.recording = false
                this.mediaRecorder.stop()
                this.stopRequested = false
            }
        }
        
        this.mediaRecorder.onstop = (e) => {
          if(this.chunks.length == 0)
          {
            return
          }
          if(this.discardRequested && !this.stopRequested)
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
          a.download = `${this.name}-capture-${new Date().toJSON().replaceAll(':','-').replaceAll('.','-')}.mp4`
          a.click()
        
          window.URL.revokeObjectURL(videoURL)
        }

        setInterval(() => {
            if(this.startRequested) {
                if(!this.recording) {
                    this.recording = true
                    this.mediaRecorder.start(1000)
                }
                this.startRequested = false
            }
        }, 100)
    }

    start() {
        this.startRequested = true
    }

    stop() {
        this.stopRequested = true
    }

    discard() {
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
        recordThat = new RecordThat(ctx.canvas, dw.c.name.toLocaleLowerCase())
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
        if(!recordThat.stopRequested && recordThat.getIsRecording())
        {
            recordThat.stopRequested = true
            setTimeout(() => recordThat.discard(), 100)
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
