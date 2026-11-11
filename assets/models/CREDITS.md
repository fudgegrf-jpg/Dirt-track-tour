# Model credits

The pace SUV in `h2.glb` and `h2-low.glb` is Kenney's Car Kit SUV, recolored
for this game. The author's mesh is not remeshed. `scripts/dress_kenney_suv.py`
paints the body yellow, turns the rockers and bumpers charcoal, splits the
existing window and headlamp faces into their own materials, and adds a roof
lightbar plus the door lettering. Both LODs use that mesh. The source is
already about 2,500 triangles, and decimating it would break the panels.

Source: https://kenney.nl/assets/car-kit
Pack file: `Models/GLB format/suv.glb` (Car Kit 3.1, 2 April 2026)
License file: `assets/models/source/kenney/License.txt`

That license is Creative Commons Zero (CC0) 1.0:
https://creativecommons.org/publicdomain/zero/1.0/

The pack license says the content can be used for personal, educational, and
commercial purposes. Crediting Kenney (www.kenney.nl) is requested and is not
a requirement. The original `suv.glb`, its color map, and the pack license
are stored next to the dressed models.

`scripts/archive/build_pace_suv_generated.py` is the retired generated shell.
It is not the mesh the game loads.

`src/HUMMER.blend` is the earlier CC0 Hummer H2 by brzynak, Blend Swap #79973
(https://creativecommons.org/publicdomain/zero/1.0/). It is retired source and
is not the mesh the game loads. The parking-lot HDRI referenced by that blend
is not included.
