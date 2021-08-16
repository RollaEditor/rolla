class FCPXML {
  #mediaInfo
  #tcMultiplier
  #tcDenominator
  #startStr
  #assetList
  #eventStr
  #sequenceStr
  #clipList
  #endStr
  #currAssetID
  #initialOffset
  #currentOffset

  constructor (mediaInfo) {
    this.#mediaInfo = mediaInfo
    this.#tcMultiplier = 1
    this.#tcDenominator = this.#mediaInfo.frameRate
    let formatNameAttr =
      'FFVideoFormat1080p' + this.#mediaInfo.frameRate.toString()
    if (!Number.isInteger(this.#mediaInfo.frameRate)) {
      // for videos that use drop-frame e.g. 29.97 fps (30000/1001 fps)
      this.#tcMultiplier = 1001 // e.g. 29.97 * 1001 = 30000
      this.#tcDenominator = this.#mediaInfo.frameRate * this.#tcMultiplier
      formatNameAttr =
        'FFVideoFormat1080p' +
        this.#mediaInfo.frameRate
          .toFixed(2)
          .toString()
          .replace('.', '')
    }
    let formatFrameDurationAttr = this.toTimecodeStr(1) // 1/frameRate
    if (this.#mediaInfo.hasVideo) {
      let formatWidthAttr = this.#mediaInfo.width
      let formatHeightAttr = this.#mediaInfo.height
      this.#startStr = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources><format id="r0" name="${formatNameAttr}" width="1920" height="1080" frameDuration="${formatFrameDurationAttr}"/><format id="r1" name="FFVideoFormatRateUndefined" width="${formatWidthAttr}" height="${formatHeightAttr}" frameDuration="${formatFrameDurationAttr}"/>`
      this.#endStr = `</spine></sequence></project></event></library></fcpxml>`
      this.#currAssetID = 2 // 0 and 1 are reserved for <format>
    } else {
      this.#startStr = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources><format id="r0" name="FFVideoFormat1080p24" width="1920" height="1080" frameDuration="1/24s"/>`
      this.#endStr = `</gap></spine></sequence></project></event></library></fcpxml>`
      this.#currAssetID = 1 // 0 is reserved for <format>
    }
    this.#assetList = []
    this.#eventStr = `</resources><library><event name="Timeline 1"><project name="Timeline 1">`
    this.#sequenceStr = ''
    this.#clipList = []
    this.#initialOffset = 3600 * this.#mediaInfo.frameRate // 1 hr in frames
    this.#currentOffset = this.#initialOffset
  }
  gcd (a, b) {
    if (a < 0.0000001) {
      return b
    }
    while (b > 0.0000001) {
      if (a > b) {
        a = a - b
      } else {
        b = b - a
      }
    }
    return a
  }
  toTimecodeStr (frameNumber) {
    let tcNumerator = frameNumber * this.#tcMultiplier
    let divisor = this.gcd(tcNumerator, this.#tcDenominator)
    return (
      (tcNumerator / divisor).toString() +
      '/' +
      (this.#tcDenominator / divisor).toString() +
      's'
    )
  }
  addClip (startFrame, endFrame) {
    let asset = ''
    let clip = ''
    let assetIDAttr = 'r' + this.#currAssetID.toString()
    let assetNameAttr = this.#mediaInfo.fileName
    let assetDurationAttr = this.toTimecodeStr(this.#mediaInfo.frameCount)
    let clipStartAttr = this.toTimecodeStr(startFrame)
    let clipDuration = endFrame - startFrame
    let clipDurationAttr = this.toTimecodeStr(clipDuration)
    let clipOffsetAttr = this.toTimecodeStr(this.#currentOffset)
    if (this.#mediaInfo.hasVideo) {
      asset = `<asset id="${assetIDAttr}" format="r1" name="${assetNameAttr}" start="0/1s" duration="${assetDurationAttr}" hasVideo="1" hasAudio="1" audioSources="1" audioChannels="2"><media-rep kind="original-media" src="${assetNameAttr}"/></asset>`
      clip = `<asset-clip ref="${assetIDAttr}" format="r1" tcFormat="NDF" name="${assetNameAttr}" start="${clipStartAttr}" duration="${clipDurationAttr}" offset="${clipOffsetAttr}" enabled="1"><adjust-transform scale="1 1" anchor="0 0" position="0 0"/></asset-clip>`
    } else {
      asset = `<asset id="${assetIDAttr}" name="${assetNameAttr}" start="0/1s" duration="${assetDurationAttr}" hasAudio="1" audioSources="1" audioChannels="2"><media-rep kind="original-media" src="${assetNameAttr}"/></asset>`
      clip = `<asset-clip ref="${assetIDAttr}" name="${assetNameAttr}" start="${clipStartAttr}" duration="${clipDurationAttr}" offset="${clipOffsetAttr}" lane="2" enabled="1"/>`
    }
    this.#assetList.push(asset)
    this.#clipList.push(clip)
    this.#currAssetID++
    this.#currentOffset += clipDuration
  }
  stringify () {
    let sequenceDurationAttr = this.toTimecodeStr(
      this.#currentOffset - this.#initialOffset
    )
    if (this.#mediaInfo.hasVideo) {
      this.#sequenceStr = `<sequence format="r0" tcFormat="NDF" tcStart="3600/1s" duration="${sequenceDurationAttr}"><spine>`
    } else {
      this.#sequenceStr = `<sequence format="r0" tcFormat="NDF" tcStart="3600/1s" duration="${sequenceDurationAttr}"><spine><gap name="Gap" start="3600/1s" duration="${sequenceDurationAttr}" offset="3600/1s">`
    }
    return (
      this.#startStr +
      this.#assetList.join('') +
      this.#eventStr +
      this.#sequenceStr +
      this.#clipList.join('') +
      this.#endStr
    )
  }
} // class FCPXML

let ffmpeg

// Check browser support and load libraries
async function initialize () {
  if (typeof SharedArrayBuffer === 'undefined') {
    document.getElementById('message').innerHTML =
      'Error: Please use latest Chrome/Firefox/Edge'
  }
  ffmpeg = FFmpeg.createFFmpeg({ log: true })
  await ffmpeg.load()
}

function download (url, fileName) {
  let link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// Convert editList to a proper output format
function generateOutput (mediaInfo, editList, format) {
  let output
  if (format === 'fcpxml') {
    output = new FCPXML(mediaInfo)
  } // add formats here
  for (let i = 0; i < editList.length; i += 2) {
    output.addClip(editList[i], editList[i + 1])
  }
  let blob = new Blob([output.stringify()], { type: 'text/plain' })

  return window.URL.createObjectURL(blob)
}

async function edit (mediaInfo) {
  let editList = [] // [clipStart, clipEnd, ... ]: clip means segment to keep
  let silenceStartMsgs = []
  let silenceEndMsgs = []
  ffmpeg.setLogger(({ message }) => {
    if (message.includes('silence_start')) {
      silenceStartMsgs.push(message)
    } else if (message.includes('silence_end')) {
      silenceEndMsgs.push(message)
    }
  }) // start logging after this line
  await ffmpeg.run(
    '-i',
    mediaInfo.fileName,
    '-af',
    'silencedetect=n=-27dB:d=1',
    '-f',
    'null',
    '-'
  )
  const minClipLength = mediaInfo.frameRate / 2 // 0.5 seconds
  editList.push(0) // start the first clip with frame 0
  for (let i = 0; i < silenceStartMsgs.length; i++) {
    let clipEnd = Math.round(
      parseFloat(silenceStartMsgs[i].split('silence_start:')[1]) *
        mediaInfo.frameRate
    )
    let clipStart = Math.round(
      parseFloat(silenceEndMsgs[i].split('silence_end:')[1]) *
        mediaInfo.frameRate
    )
    if (clipEnd - editList[editList.length - 1] < minClipLength) {
      editList.pop() // clip is too short, pop clipStart and do not push end
    } else {
      editList.push(clipEnd)
    }
    editList.push(clipStart)
  }
  editList.push(mediaInfo.frameCount) // end the last clip with last frame

  return editList
}

// Get the metadata of the audio/video file
async function getMediaInfo (mediaFile) {
  let mediaInfo = {
    // default values
    fileName: mediaFile.name,
    hasVideo: false,
    width: 1920,
    height: 1080,
    frameRate: 24,
    frameCount: 1440 // duration in frames
  }
  let rawLogMsgs = []
  ffmpeg.setLogger(({ message }) => {
    if (message.startsWith('D', 2) || message.startsWith('S', 4)) {
      rawLogMsgs.push(message)
    }
  })
  await ffmpeg.run('-i', mediaFile.name)

  for (let logMsg of rawLogMsgs) {
    if (logMsg.includes('Video')) {
      mediaInfo.hasVideo = true
      mediaInfo.width = parseInt(logMsg.split(',')[3])
      mediaInfo.height = parseInt(logMsg.split(',')[3].split('x')[1])
      mediaInfo.frameRate = parseFloat(logMsg.split(',')[5])
      break
    }
  }
  if (!Number.isInteger(mediaInfo.frameRate)) {
    // get exact drop-frame frame rate e.g. 29.97 fps -> 30000/1001 fps
    mediaInfo.frameRate = (Math.ceil(mediaInfo.frameRate) * 1000) / 1001
  }
  let hrs = parseInt(rawLogMsgs[0].split(':')[1]) // duration
  let mins = parseInt(rawLogMsgs[0].split(':')[2])
  let secs = parseFloat(rawLogMsgs[0].split(':')[3])
  // TODO: get frame count properly
  mediaInfo.frameCount =
    Math.floor(((hrs * 60 + mins) * 60 + secs) * mediaInfo.frameRate) - 1
  return mediaInfo
}

async function run (event) {
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load()
  }
  let mediaFile = event.target.files[0]
  ffmpeg.FS('writeFile', mediaFile.name, await FFmpeg.fetchFile(mediaFile))
  document.getElementById('message').innerHTML = 'Processing...'

  let mediaInfo = await getMediaInfo(mediaFile)
  let editList = await edit(mediaInfo)
  const format = 'fcpxml' // should be user-defined in future versions
  let outputURL = generateOutput(mediaInfo, editList, format)

  download(outputURL, mediaFile.name + '.' + format)

  document.getElementById('message').innerHTML = 'Choose a Clip'
}

document.getElementById('media-upload').addEventListener('change', run)

window.addEventListener('load', initialize)
