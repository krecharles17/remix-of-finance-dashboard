---
name: template-thumbnail
description: Capture a 1600x900 thumbnail screenshot of the running app for use as a template listing, gallery card, or social preview image. Use when the user asks for a thumbnail, cover image, listing image, or app screenshot at a set size, optionally in light or dark mode.
---

# Template thumbnail

Produces a clean 1600x900 screenshot of the app's main view, saved to
`/mnt/documents/` so the user can download it directly.

## Rules

- Fixed viewport of 1600x900. Never use `full_page=True` — the listing crops to
  the 16:9 frame, so anything below the fold is wasted.
- `device_scale_factor=2` so the image is retina-crisp (3200x1800 pixels at a
  1600x900 CSS layout). Do not raise the CSS viewport to get more pixels; that
  changes the layout.
- Capture the route that best represents the product — usually `/`, but use the
  route the user is looking at if they named one.
- Set the theme *before* the capture navigation, not after, so nothing renders
  in the wrong theme. Read the theme's localStorage key from the project's theme
  toggle component rather than guessing it.
- Wait for `networkidle` plus a few seconds of settle time. These apps stage
  their entry animations, count-up tickers, and chart transitions on load; a
  capture taken too early catches half-drawn charts and zeroed numbers.
- Do not hover, click, or open panels. The thumbnail shows the resting state.
- Always view the resulting PNG before delivering it, and check for: clipped or
  overlapping text, charts mid-animation, tickers still at zero, empty states,
  and the theme actually being applied.

## Script

```python
import asyncio
from playwright.async_api import async_playwright

THEME_KEY = "app-theme"   # read the real key from the theme toggle component
THEME = "dark"            # or "light"
URL = "http://localhost:8080"
OUT = "/mnt/documents/thumbnail.png"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        c = await b.new_context(viewport={"width": 1600, "height": 900},
                                device_scale_factor=2)
        pg = await c.new_page()
        # First load just to own the origin so localStorage can be written.
        await pg.goto(URL, wait_until="domcontentloaded")
        await pg.evaluate(f"window.localStorage.setItem({THEME_KEY!r}, {THEME!r})")
        # Second load renders in the chosen theme from first paint.
        await pg.goto(URL, wait_until="networkidle")
        await pg.wait_for_timeout(4000)   # let staged motion and tickers finish
        await pg.screenshot(path=OUT)
        print("dark:", await pg.evaluate(
            "document.documentElement.classList.contains('dark')"))
        await b.close()

asyncio.run(main())
```

Write the script under `/tmp/browser/<slug>/` and run it with `python3`. Keep it
out of the project checkout.

## Delivering

Name the file after the product, not `thumbnail.png` — e.g.
`cfo-command-center-thumbnail.png`. Then emit the artifact tag:

```
<presentation-artifact path="cfo-command-center-thumbnail.png" mime_type="image/png"></presentation-artifact>
```

Close with the dimensions and the theme captured, and nothing else.
