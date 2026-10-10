# ripe-receiver

The Google Cast receiver page for [ripe](https://github.com/jasondyck/ripe), an
AirPlay → Google Cast bridge. Served by GitHub Pages; Cast devices load it when
ripe launches its receiver app.

It plays ripe's audio stream and shows what's playing: cover, title, artist,
album, a timeline, and which device is casting. ripe sends updates as
`NOW_PLAYING` messages on `urn:x-cast:com.jasondyck.ripe`, and as `customData`
on each LOAD:

```json
{ "type": "NOW_PLAYING", "sender": "iPhone", "title": "…", "artist": "…",
  "album": "…", "art": "http://…/art/…/1.jpg",
  "position_ms": 83000, "duration_ms": 245000 }
```

`title`/`artist`/`album`/`art` are omitted until ripe trusts them; the page
then shows only who is casting.

Preview in a desktop browser with `?demo` (or `?demo=idle`); `title`, `artist`,
`album`, `art` and `sender` query parameters override the demo values.

Static files only: `index.html`, `style.css`, `receiver.js`. No build step.
