import * as _math from 'mathjs'

declare global {
  const math: typeof _math // eslint-disable-line no-unused-vars
}

// Rationalize a decimal to fraction (in seconds)
function rationalize (value: number) {
  return math.format(math.fraction(value), { fraction: 'ratio' }) + 's'
}

// Produces an XMLElement
function createXMLElement (tagName: string) {
  return document.implementation.createDocument(null, tagName).documentElement
}

export class AssetClip {
  assetClip = createXMLElement('asset-clip')
  start: number
  duration: number
  offset: number

  constructor (start: number, duration: number, offset: number, fileName: string) {
    this.start = start
    this.duration = duration
    this.offset = offset
    // Fill in above info in assetClip
    setAttributes(this.assetClip,
      {
        offset: rationalize(this.offset),
        // 'offset': this.offset.toString(), // TODO: restore DEBUG changes
        name: fileName,
        format: 'r1',
        tcFormat: 'NDF',
        start: rationalize(this.start),
        // 'start': this.start.toString(),
        ref: 'r2', // TODO: should r2 be factored out into separate variable?
        enabled: '1',
        duration: rationalize(this.duration)
        // 'duration': this.duration.toString()
      })
  }
}

export class Cut {
  start: number
  end: number

  // Refer to https://beginnersapproach.com/davinci-resolve-start-timecode/

  constructor (start: number, end: number) {
    this.start = start
    this.end = end
    // Reason for conditional check

    // mitigation being perform boundary check
  }
}

// Let FCPXML only support Video First
// TODO: upgrade to support Audio CLEANLY

export class FCPXML {
  // Constants:
  xmlParser = new DOMParser() // Parser
  // var processor = new XSLTProcessor(); Not sure if I will need to use xpath + xslt
  // Note: below xml is only for video
  xml = this.xmlParser.parseFromString(
    '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources>' +
    '<format id="r0" width="1920" name="FFVideoFormat1080p30" height="1080" frameDuration="1/30s"/>' +
    '<format id="r1" width="1280" name="FFVideoFormat720p30" height="720" frameDuration="1/30s"/>' +
    '</resources><library>' +
    '<event name="output">' +
    '<project name="output">' +
    '<sequence format="r0" duration="271/15s" tcFormat="NDF" tcStart="3600/1s">' +
    '<spine>' +
    '</spine></sequence></project></event></library></fcpxml>', 'text/xml')
  // TODO: setup width and height properly
  // TODO: merge tcStart with same properly in cuts

  // Internal States
  // MAX_CUTS_TO_SAVE: number
  duration!: number // Well... Not the ideal practice but works
  cuts: Cut[] = []
  media: File

  // Only to set the states
  // Don't do any processing
  constructor (media: File, cuts: Cut[] = []) {
    this.media = media // If I want to determine media type (video/audio), add it here
    this.cuts = cuts
    // this.MAX_CUTS_TO_SAVE = MAX_CUTS_TO_SAVE
    // this.setDuration().then()
    // Above code causes premature return
    // duration is set long after other class methods are called...
  }

  // Write changes to the xml
  // Also handles async operations that cannot be placed in constructor (Factory)
  async write () {
    // Adds the input file as <asset> under <resources>
    await this.setDuration()
    this.setAsset()
    this.setAssetClips()
  }

  // Adds the Clips to the HTML
  setAssetClips () {
    // Calculate duration (for <sequence>)
    // duration: duration of video after cut
    let durationAfterCuts = this.duration
    for (const cut of this.cuts) {
      durationAfterCuts -= cut.end - cut.start
    }

    // Add duration to <sequence>
    const sequence = this.xml.querySelector('sequence')
    if (sequence == null) {
      console.error('Either Default xml preset or selection is flawed')
      return
    }
    sequence.setAttribute('duration', rationalize(durationAfterCuts))

    // Set Asset-clips

    // Selecting spine
    const spine = this.xml.querySelector('spine')
    if (spine == null) {
      console.error('Either Default xml preset or selection is flawed')
      return
    }
    // And add each Asset-clips as spine's child

    // Algorithm for generating Asset-clips

    // Background
    // Note Each asset clip has 3 attributes: start, duration, offset
    // We use n to represent nth asset-clip in 0 based (order by ascending time)
    // We use offsets, start, durations: number[] to represents the attributes for asset-clips
    // For instance, offsets[n] represent offset in for nth asset clip

    // Algorithm
    // for offset, note offsets[n] = offsets[n - 1] + durations[n - 1]
    // for start, we use an array splits: int[], for which stores number of splits in int
    // For example, for a 10s long cut-less video, splits = [0, 10]
    // For same video but with a cut from 2s - 4s, splits = [0, 2, 4, 10]
    // Note every even index (0-based) element from splits (e.g. 0, 4) are start value
    // and every odd elements are end value
    // Therefore the steps are:
    // Step 1: Generate splits
    // For cut in this.cuts, push cut.start and cut.end to splits
    // Sort splits
    // Step 2: Loop through splits by index (i), for each splits[i]
    // if i is even, push splits[i] to starts and splits[i + 1] - splits[i] to durations
    // otherwise do nothing
    // As optimization, do i += 2 instead of i++ (this way i is always even, skips over 50% of elements)
    // Step 3: let offsets[0] = timeCode (in this case 3600), then apply
    // offsets[n] = offsets[n - 1] + durations[n - 1] iteratively to compute offsets
    // Step 4: One for loop to:
    // generate an assetClip
    // add the generated asset-clip to spine via spine.appendChild(assetClip.assetClip)

    let numOfClips = this.cuts.length + 1 // total number of asset-clips
    // e.g. we have 1 asset-clip for 0 cuts, 2 asset-clips for 1 cut, and so forth

    let splits: number[], starts: number[], durations: number[], offsets: number[]
    // splits = starts = durations = offsets = [] // leaving this line here to show how stupid I am
    // to refer four variables to same [] array
    // eslint-disable-next-line prefer-const
    [splits, starts, durations, offsets] = [[], [], [], []] // dumb but trustworthy way

    splits.push(0, this.duration)
    for (const cut of this.cuts) {
      // Explanation:
      // ffmpeg outputs weird values such as -2.08333e-05 near start of video
      // such value being very close to 0 (both would be rounded
      // to 0/1s in fraction, causing Da Vinci to ill-behave.
      // There's also the need of considering if a value at very end is close
      // to this.duration

      // Therefore, the mitigation being
      // say we have [0, 10] as split as a cut is [0, 5]
      // clearly, the split should be [5, 10]
      // therefore whenever cut.start is close to 0
      // add cut.end, remove 0, and reduce num_of_clips by 1
      // and vise versa
      if (cut.start < 1 / 30) {
        splits.push(cut.end)
        splits.shift()
        numOfClips--
      } else if (cut.end > (this.duration - 1 / 30)) {
        splits.push(cut.start)
        splits.pop()
        numOfClips--
      } else if (cut.end - cut.start < 2 / 30) {
        // Mitigation for case 1: Ignore
        numOfClips--
      } else {
        splits.push(cut.start, cut.end)
      }

      // TODO: address the potential Edge Case of entire video being silent
      // if it causes issue, determine if checks should be placed upstream or there
    }
    splits.sort((a, b) => a - b)

    // Mitigation for
    // Case 1: start: 89.3867, end: 89.394
    // Case 2: end: 89.3867, start: 89.394

    // Mitigation: for case 1, I can ignore small cuts
    // when adding them to splits
    // For case 2, say if I have splits [0, 1, 5, 5.0000001, 6, 10]
    // After placing cuts [1, 5] and [5.0000001, 6]
    // Then Ideally, the two close cuts should be merged into one cut
    // Which can be done by one pass through splits (index i)
    // and for every even i, remove or ignore them
    for (let i = 0; i < splits.length; i += 2) {
      if (splits[i + 1] - splits[i] > 2 / 30) {
        // Implement Case 2 Mitigation: Ignore
        starts.push(splits[i])
        durations.push(splits[i + 1] - splits[i])
      } else {
        numOfClips--
      }
    }

    offsets.push(3600)
    for (let i = 1; i < numOfClips; i++) {
      offsets[i] = offsets[i - 1] + durations[i - 1]
    }

    for (let i = 0; i < numOfClips; i++) {
      const assetClip = new AssetClip(starts[i], durations[i], offsets[i], this.media.name)
      spine.appendChild(assetClip.assetClip)
    }
  }

  // Add proper asset value
  setAsset () {
    // Navigate to resources
    const resources = this.xml.querySelector('resources')
    // Add asset (no attributes)
    const asset = createXMLElement('asset')
    // Set attributes for asset
    setAttributes(asset, {
      hasVideo: '1',
      audioSources: '1',
      hasAudio: '1',
      name: this.media.name,
      format: 'r1',
      start: '0/1s',
      audioChannels: '2', // TODO: address single channel old school case
      id: 'r2',
      duration: rationalize(this.duration)
    })
    // Add child node to asset
    const mediaRep = createXMLElement('media-rep')
    setAttributes(mediaRep, {
      kind: 'original-media',
      src: '' // TODO: determine if there's a better way to check src
    })
    asset.appendChild(mediaRep)
    // Defensive coding
    // Ideally this should never be executed
    if (resources == null) {
      console.error('Either Default xml preset or selection is flawed')
      return
    }
    resources.appendChild(asset)
  }

  async setDuration () {
    // Load the video in an HTML element
    const video = document.createElement('video')
    video.src = URL.createObjectURL(this.media)
    video.load() // not sure if this is needed

    // Wait for the video to finish loading
    await new Promise<void>(resolve => (video.ondurationchange = () => resolve()))

    this.duration = video.duration
    video.remove()
  }

  async addCut (cut: Cut) {
    this.cuts.push(cut)
  }

  async addCuts (cuts: Cut[]) {
    this.cuts.concat(cuts)
  }

  async download () {
    // TODO: decouple this method
    // with get() returns string form of xml
    // and let the caller handle download()
    // Reason: may support multiple format in future
    // and each format would require a download() with duplicate code

    // Generate a download button (to be clicked on)
    const link = document.createElement('a')

    // Serialize and attach this.xml to the download button
    link.href = URL.createObjectURL(
      new Blob([this.serialize()], { type: 'text/xml' }))
    // link.href = URL.createObjectURL(new Blob([this.xml.documentElement.outerHTML],
    //   { type: 'text/xml' }))
    link.download = 'result.fcpxml'
    document.body.appendChild(link)
    // Click the download button
    link.click()
    // Remove the download button
    link.remove()
  }

  serialize () {
    // Returns string content of xml representation of fcpxml
    // Precondition: write() is already called exactly once
    const xmlSerializer = new XMLSerializer()
    return xmlSerializer.serializeToString(this.xml).replaceAll('xmlns="http://www.w3.org/1999/xhtml"', '')
  }
}

function setAttributes (element: Element, Attrs: { [key: string]: string }) {
  for (const key in Attrs) {
    element.setAttribute(key, Attrs[key])
  }
}

// Parses output (blob) from ffmpeg
// and convert to cuts
// Credit to Aidan
export class FFmpegOutputParser {
  static async getCuts (ffmpegOut: Blob) {
    //
    const cuts: Cut[] = []
    const out = await ffmpegOut.text()
    // Break output line by line
    const split = out.split('\n')

    const startString = 'silence_start'
    const endString = 'silence_end'
    const times = [-1.0, -1.0]
    for (const line of split) {
      if (line.includes(startString)) {
        times[0] = parseFloat(line.split('=')[1])
      } else if (line.includes(endString)) {
        times[1] = parseFloat(line.split('=')[1])
      }
      if (!times.includes(-1.0)) {
        cuts.push(new Cut(times[0], times[1]))
        // console.log(`${times[0]} ${times[1]}`)
        times[0] = -1.0
        times[1] = -1.0
      }
    }
    return cuts
  }
}
