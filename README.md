# Dirt-track-tour

Mobile-ready Three.js dirt late model racing: five tracks, your team, and the miles between.

**Play:** https://raw.githack.com/fudgegrf-jpg/Dirt-track-tour/main/index.html

## Higher detail / Smoother contacts / 25-mph corner pit road
All five tracks now share a drivable, detailed track-integrated paddock. The 25-mph pit road peels from a corner, loops behind the oval, and enters a left-side paddock. Beveled haulers, diamond-plate ramps, pitched canopies, detailed pumps/storefront, textured lots and instanced foliage scale with quality; static truck meshes are batched and distant forest chunks are culled. Race and articulated semi collisions use bounded substep corrections and low rebound, with no collision teleporting. Results retain the same race world/car; use the marked corner gate/loop road, find Bay 42, line up and load onto the open ramp. Crew assist costs $300. Tie-down/door animations lead directly to the highway. Pace laps and cautions auto-drive by default with a smooth green-flag handover; disable in Settings. One physical midpoint fuel stop per leg, with off/on ramps, replaces the refuel menu: park in the highlighted pump bay to fill in real time, then merge back. Signed parking bays preserve rest and discounted road-service repairs without a menu. Overpass supports now sit outside lanes and the median; regional greenery uses corrected natural instance colors. J / touch Jake toggles the richer inline-six diesel engine brake. [Hear diesel demos](audio-samples/semi-demos.html).

Your default driver is **Jayden Fudge #42**, with the selectable **Classic 42** paint: off-white sides, royal-blue nose/hood/roof, yellow outlined numbers, lime rocker trim and fictional contingency decals. The default identity and Classic 42 livery remain intact; the new model adds physical tread and coachwork detail. Only untouched legacy Dale Rhodes/Jayden Fudge #21 red/white default profiles migrate; customized profiles stay yours. Migration preserves points, results, cash and crew. Edit the profile before starting a career to personalize your team and livery.

Phone: turn sideways. Steer on the left and hold GAS/BRAKE on the right. Optional tilt, camera, pause, fullscreen, cruise/exit and loading-winch controls appear for each stage. First touch unlocks audio. Phones start on Auto / Low graphics.

Keyboard: WASD/arrows drive, C camera, P/Esc pause, H help. See START-HERE.txt and CREDITS.txt.

Fonts and icons are embedded; engine/effect audio is synthesized, and owner-supplied menu music is embedded as compressed MP3 text chunks. No install/build is needed. To play locally, serve this folder over HTTP. Raw.githack can cache branch updates for a few minutes and may show an “Open the page” confirmation before the game. A commit-pinned rawcdn.githack link avoids branch-version caching.

### Articulated rig, cockpit and paid Fast Travel
The highway trailer has independent world-space axle/heading state, constrained at the fifth wheel, with off-tracking, yaw inertia, a jackknife limit and loaded-mass acceleration/braking. C or touch Cam cycles the chase, woodgrain cockpit (10 live instruments), and roadside cameras. Fast Travel quotes remaining-mile fuel plus relief hauling, requires confirmation, and updates arrival/season saves once.

### Nitro Riffs / continuous showroom turntable
Menu music: "Nitro Riffs" by Jayden (made with Suno), supplied by the owner. The complete song loops after the first tap/key, with saved music volume/mute and driving/menu fades. A 112-kbps stereo MP3 is embedded in three text chunks, each below 1.5 MB, then played from a Blob URL without decoding the whole song into a large PCM buffer. MP3 works in Safari and other modern browsers. Title/garage cars rotate at a constant 0.14 rad/s (about 45 seconds per full turn), without stopping or easing.

### Grounded-world / recovery / visual polish
Pit roads are clipped to the actual oval edge and graded to the paddock, with triangle-matched wheel heights and conforming cone feet. A wreck or confirmed Pause → Retire to paddock goes straight to your hauler while preserving classification, purse, payroll, points and damage; normal finishes retain the pit-road drive. The rebuilt cockpit has a shaped wood dash, live instruments, leather-look wheel, framed windshield, red hood and economical rearward mirrors. Procedural clay normal/roughness maps, layered textured foliage, grass, crowd heads, outdoor reflections and softer shadows retain phone Low-tier scaling. Scene changes now release shadow render targets.

### Graphics 2 / Salina Highbanks Speedway
The first stop is now Salina Highbanks Speedway in Pryor Creek, Oklahoma: a narrow 3/8-mile oval with progressive high banking, dark clay, white edge markings, front bleachers/press box, a blue backstretch stand, infield light towers, sheds, gravel access and parking. The Oklahoma/Ozark highway leg replaces the old first leg. The corner pit-road/hauler flow remains.

Six CC0 Poly Haven scans supply local JPEG albedo, OpenGL normal and roughness maps for clay, grass, asphalt, concrete, metal and wood. All 18 JPEGs are embedded losslessly as text-safe data URLs in six sub-1.5-MB modules; no remote image service or binary push is required. Sources, authors and SHA-256 hashes: [texture licenses](assets/textures/LICENSES.json), also CREDITS.txt. The late model is original procedural geometry, now with physical tread lugs, panel fasteners, spoiler supports, actual scene reflections and quality-scaled livery textures, for player and AI alike.

Settings: **Auto / Low / Medium / High**, saved locally. Auto selects Low on phones and Medium on desktop. All tiers retain PBR maps, dust, tire wear and ACES; High adds depth-aware screen-space ambient occlusion, bloom, a subtle vignette and grading. Phones cap rendering resolution/shadows; High is optional and more expensive. Scenery build budgets apply at the next stage.

**Reverse:** hold S/down-arrow or the touch Brake control to stop, then continue holding to back the semi at up to 2.5 m/s. Steering reverses naturally and the trailer remains independently articulated. Throttle brakes backing motion before moving forward. Backing consumes fuel rather than granting fuel; fuel/rest/service require near-zero absolute speed. The race car and paddock car also reverse.
