# Wood Type Wordle

A Wordle clone styled as wood type blocks on a printing press. Plain HTML, CSS
and JavaScript with no build step.

- Play with 3, 5 or 7 letters, as many words as you like. Each length keeps
  its own progress and stats, and you get one more try than the word has letters.
- A welcome popup greets players on every visit.
- Hint reveals one letter in its right spot: 1 hint for 3 letters, 2 for 5,
  3 for 7. Hints count as found letters in hard mode and show in shared results.

## Run

Open `index.html` in a browser. Progress, stats and settings are saved in the
browser's localStorage.

## Files

- `index.html` – page structure and the help, stats and settings dialogs
- `styles.css` – the Wood Type look (design tokens at the top)
- `js/game.js` – game logic: word picking, scoring, hints, hard mode, stats, sharing
- `js/words.js` – generated word lists (don't edit by hand)
- `data/answers-3.txt`, `answers-5.txt`, `answers-7.txt` – the curated answer words
- `tools/build_words.py` – rebuilds `js/words.js`

## Changing the word lists

Edit `data/answers-3.txt`, `answers-5.txt` or `answers-7.txt`, then run:

```bash
python3 tools/build_words.py
```

Accepted guesses come from `/usr/share/dict/words` (public domain) plus
generated plurals, past tenses and -ing forms.

## How words are picked

Each length deals answers from a shuffled list, so no word repeats until every
word of that length has been played; then the list is reshuffled. The shuffle
and current words are saved in the browser, so a reload keeps the same board.
When a word is finished, Next word (or Enter) deals the next one.
