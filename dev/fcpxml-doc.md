# FCPXML Documentation

## Purpose

This documentation is not intended to contain full specification of FCPXML.

The purpose of the the document is to convey the basic about FCPXML (as a Da Vinci Resolve Timeline format), including

- Barebone Structure for FCPXML (for new video file)
- Basic for asset-clip (and corresponding rules)

## Barebone Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
    <resources>
        <format height="1080" frameDuration="1/30s" name="FFVideoFormat1080p30" width="1920" id="r0"/>
        <format height="720" frameDuration="1/30s" name="FFVideoFormat720p30" width="1280" id="r1"/>
        <asset hasVideo="1" audioSources="1" hasAudio="1" name="Demo.mp4" format="r1" start="0/1s" audioChannels="2" id="r2" duration="3853/30s">
            <media-rep kind="original-media" src="file:///Users/MyUsername/Downloads/Demo.mp4"/>
        </asset>
    </resources>
    <library>
        <event name="Timeline 1 (Resolve)">
            <project name="Timeline 1 (Resolve)">
                <sequence tcStart="3600/1s" format="r0" tcFormat="NDF" duration="3853/30s">
                    <spine>
                        <asset-clip offset="3600/1s" name="Demo.mp4" format="r1" tcFormat="NDF" start="0/1s" ref="r2" enabled="1" duration="3853/30s">
                        </asset-clip>
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>
```

xml is a tree-like structure, branching down.

For the above example file (exported complete timeline with no cuts/other editing from Da Vinci Resolve), a few key observations can be made. Note: This document focuses on elements responsible for making cuts, instead of every single element. For elements that remain unchanged after cuts they are ignored for our purpose.

### Resource & Library split

It seems that resources store the raw assets (files) used by the timeline, while library stores the actual timeline (containing editing etc)

### id

Elements under resource sections has an id attribute, and elements under library use the id to cross reference (by placing id in ref attribute)

### Formatting

The timeline is generated from a 1080p30 video file. And, it seems that fcpxml uses <format\> tag to decide video format such as video, height and duration. It is likely that Da Vinci Resolve extracted such information from video metadata and placed appropriate <format\> accordingly.

It is still unknown if name attribute for <format\> is just a convention, or if it is actually useful.

Also, as a 1080p30 file is used, it is also unknown why Da Vinci Resolve placed a 720p30 format option too. Still, according to our testing, the unused format can be removed safely.

### Event, Project, Sequence, and asset-clip

All of the 4 are common concept in all video editing softwares. For the sake of this article, we only need to know sequence represents a timeline (for which the attributes represent timecode and timeline duration.

## Cuts

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
    <resources>
        <format height="1080" frameDuration="1/30s" name="FFVideoFormat1080p30" width="1920" id="r0"/>
        <format height="720" frameDuration="1/30s" name="FFVideoFormat720p30" width="1280" id="r1"/>
        <asset hasVideo="1" audioSources="1" hasAudio="1" name="Demo.mp4" format="r1" start="0/1s" audioChannels="2" id="r2" duration="3853/30s">
            <media-rep kind="original-media" src="file:///Users/User/Downloads/Demo.mp4"/>
        </asset>
        <asset hasVideo="1" audioSources="1" hasAudio="1" name="Demo.mp4" format="r1" start="0/1s" audioChannels="2" id="r3" duration="3853/30s">
            <media-rep kind="original-media" src="file:///Users/User/Downloads/Demo.mp4"/>
        </asset>
    </resources>
    <library>
        <event name="og timeline (Resolve)">
            <project name="og timeline (Resolve)">
                <sequence tcStart="3600/1s" format="r0" tcFormat="NDF" duration="3793/30s">
                    <spine>
                        <asset-clip offset="3600/1s" name="Demo.mp4" format="r1" tcFormat="NDF" start="0/1s" ref="r2" enabled="1" duration="2/1s">
                        </asset-clip>
                        <asset-clip offset="3602/1s" name="Demo.mp4" format="r1" tcFormat="NDF" start="4/1s" ref="r3" enabled="1" duration="3733/30s">
                        </asset-clip>
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>
```

For this example file, exactly one part of the video was cutted out (2s - 4s). This gives insight into the rules for <asset-clip\>.

### Offset, start, duration

Note that we now have 2 <asset-clip\> instead of 1 after the cut. We can then confirm that <asset-clip\> represent different parts of the timeline, and the content & position of the asset clips are dictated by <asset-clip\> attributes.

Offset: the start of an <asset-clip\> in the timeline (using timeline as reference frame).

Duration: the duration of an <asset-clip\>

ref (as review): reference to the raw video <asset-clip\> is based on

Start: along with duration, decides which part of video from the raw video should be taken. (e.g. 4s - 15s from video means start at 4s and duration of 11s)

It is unknown that why copies of <asset\> referencing the same raw video is made. However, removing id="r3" and changing ref="r3" to ref="r2" yields same result for Da Vinci Resolve. So, it is not necessary to have many <asset\> elements for each <asset-clip\>

## Recommended Readings

<https://developer.apple.com/documentation/professional_video_applications/fcpxml_reference/describing_final_cut_pro_items_in_fcpxml>
