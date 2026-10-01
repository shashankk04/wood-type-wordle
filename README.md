# Wood Type Wordle

A Wordle clone styled as wood type blocks on a printing press. Plain HTML, CSS
and JavaScript with no build step.

- Play with 3, 5 or 7 letters. Each length has its own daily word, saved
  progress and stats, and you get one more try than the word has letters.
- Hint reveals one letter in its right spot: 1 hint for 3 letters, 2 for 5,
  3 for 7. Hints count as found letters in hard mode and show in shared results.

## Run

Open `index.html` in a browser. Progress, stats and settings are saved in the
browser's localStorage.

## Files

- `index.html` – page structure and the help, stats and settings dialogs
- `styles.css` – the Wood Type look (design tokens at the top)
- `js/game.js` – game logic: daily word, scoring, hard mode, stats, sharing
- `js/words.js` – generated word lists (don't edit by hand)
- `data/answers-3.txt`, `answers-5.txt`, `answers-7.txt` – the curated daily answers
- `tools/build_words.py` – rebuilds `js/words.js`

## Changing the word lists

Edit `data/answers-3.txt`, `answers-5.txt` or `answers-7.txt`, then run:

```bash
python3 tools/build_words.py
```

Accepted guesses come from `/usr/share/dict/words` (public domain) plus
generated plurals, past tenses and -ing forms.

## How the daily word is picked

Puzzle No. 1 is 1 October 2026 (`LAUNCH_UTC` in `js/game.js`). Each local day
moves one step through a fixed shuffle of each answer list, so every player gets
the same word on the same day.
