/* The built-in data: notation glyph outlines (from the Bravura font) and the music library.
   python3 build.py inlines both; when running from src/ they load as JSON modules. */
import GLYPHS from '../data/glyphs.json' with { type: 'json' };
import LIBRARY_DATA from '../data/library.json' with { type: 'json' };

export { GLYPHS, LIBRARY_DATA };
