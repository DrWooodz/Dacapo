/* The built-in data: notation glyph outlines (from the Bravura font), the music library, and the tunes.
   python3 build.py inlines them; when running from src/ they load as JSON modules. */
import GLYPHS from '../data/glyphs.json' with { type: 'json' };
import LIBRARY_DATA from '../data/library.json' with { type: 'json' };
import SONGS_DATA from '../data/songs.json' with { type: 'json' };

export { GLYPHS, LIBRARY_DATA, SONGS_DATA };
