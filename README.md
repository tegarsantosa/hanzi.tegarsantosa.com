# Learn Hanzi with tegarsantosa

Write Chinese characters stroke by stroke, directly on screen. Everything runs in the browser:
no server, no accounts, no build step.

**Features**

- Simplified or traditional character set (toggle in the header).
- Two modes: **Random** (endless characters from a frequency-ranked pool) and **Search**
  (find a character by hanzi, pinyin such as `ni3` / `nǐ`, or English, or type a whole word).
- Repetitions per character (1–10).
- Stroke guidance with the 28 standard strokes, in two styles:
  - **Realtime**: each upcoming stroke lights up on top of the character.
  - **Step-by-step**: one box per stroke laid out horizontally; every box repeats the previous strokes and adds one.
- After a searched character, related characters are suggested (components, characters that contain it,
  same radical, homophones).
- Progress, including a snapshot of your own handwriting, is saved in `localStorage` only.
  The app says so and offers export / import as JSON.
- Claymorphism UI, dominant blue, confetti and short cheers.

**Data**

- 9,574 characters with stroke paths and medians from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)
  (via [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)), licensed under the Arphic Public License
  (see `data/ARPHICPL.TXT`). This covers every common simplified and traditional character.
- Pinyin, definitions, radicals and decompositions: Make Me a Hanzi `dictionary.txt`.
- Simplified/traditional relationships: [OpenCC](https://github.com/BYVoid/OpenCC) `STCharacters.txt` / `TSCharacters.txt`.
- Frequency ranks: Jun Da's Modern Chinese Character Frequency List.
- Rendering and stroke grading: [Hanzi Writer](https://hanziwriter.org) (MIT, `vendor/`).

**Run locally**

Any static file server works (ES modules need `http://`, not `file://`). A tiny one is included:

```bash
node scripts/serve.mjs 8765
```

then open <http://localhost:8765>.

**Deploy to Netlify**

Connect the repository, or drag the folder into Netlify Drop. `netlify.toml` publishes the root with no build command.

**Rebuild the data**

```bash
mkdir -p scratch && cd scratch
npm init -y && npm install hanzi-writer hanzi-writer-data
curl -sLO https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt
curl -sLO https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/STCharacters.txt
curl -sLO https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/TSCharacters.txt
curl -sL "https://lingua.mtsu.edu/chinese-computing/statistics/char/download.php?Which=MO" | iconv -f GB18030 -t UTF-8 > junda_utf8.txt
cd .. && node scripts/build-data.mjs scratch .
```

**Layout**

```
index.html          single page, four views (setup, practice, progress, strokes)
css/style.css       claymorphism theme
js/app.js           boot, routing, setup screen, progress + strokes views
js/practice.js      practice engine (pads, quiz, guidance, celebrations)
js/data.js          index loading, search, random pools, related characters
js/strokes.js       28 standard strokes + heuristic stroke classifier
js/storage.js       localStorage settings and progress
js/fx.js            confetti, cheers, sparkles, toasts
data/index.json     compact character index
data/strokes/*.json one stroke file per character (hex code point)
vendor/             Hanzi Writer
scripts/            data build script + tiny dev server
```
