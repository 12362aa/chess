# Am-Kh Chess 1.2 (version code 3)

## Puzzle behavior research

Reviewed through the desktop browser on 20 October 2026:

- [Chess.com puzzle ratings](https://support.chess.com/en/articles/8602396-how-do-puzzle-ratings-work): first incorrect move or hint fails the rated attempt; a clean solution gains rating according to relative difficulty. Standard favors easier puzzles; Hard and Extra Hard offer higher difficulty.
- [Chess.com puzzle modes](https://support.chess.com/en/articles/8608686-how-do-puzzles-work-on-chess-com): Rush has three misses and does not affect rating; custom training is unrated; hints after a correct move can still earn progression points.
- [Chess.com puzzle points](https://support.chess.com/en/articles/9681952-what-are-puzzle-points-on-chess-com): progression points are separate from rating. Entry-tier base awards are 15/20/25.

The published behavior is implemented with Am-Kh's existing Elo display and Glicko uncertainty. Chess.com's exact rating constants and bonus formulas are not public; numerical equality is not claimed. Am-Kh uses 15/20/25 clean points and one-third base points for a hint after at least one correct move. Existing world ranks remain tied to rating. A failed rated attempt can be retried as practice without a second rating change or repeated reward. Other modes are unrated.

## Rendering and engine changes

Store/Rewards portals now use transform and opacity instead of full-screen canvas redraws. Rewards retains its existing opening sound. Catalog thumbnails remove SMIL animation and SVG filters; full detail previews retain animation. Hidden screens pause decoration; active games pause background effects. Drag hit testing no longer toggles ghost display. Puzzle hub prepares its world before navigation. Engine ocean adds fish, turtle, coral and reef layers.

Stockfish initialization, queue wait and search share a total move deadline; UCI search is bounded by depth and time. Stale workers are ignored and gameplay move jobs can be cancelled. The fallback searches in a dedicated worker with a time budget. Nour skill/random settings and stage definitions, and Stockfish preset Elo, remain intact. Timing limits can affect achieved search depth on slower devices.

## Home daily quests

Separate from Rewards missions: play one game (5 coins, 8 XP), win one game (8 coins, 12 XP), solve three puzzles (6 coins, 10 XP). Progress caps at target, claims are transactional and unique per UTC day, accounts are isolated, and local game reports carry a stable event ID. Two-player games count for play; wins require a competing opponent. Sign-in is needed to collect account rewards.

API requests bypass service-worker caching, preventing stale wallet and quest data. Generated bundles exclude temporary clipboard screenshots. Existing local originals are retained.

## Validation

- `node scripts/test-mobile-update.js`: puzzle outcomes/mode isolation, deadlines/cancellation/stale workers, legal bounded fallback, account response races, API cache exclusion, claim dedupe/caps/UTC reset/persistence.
- Existing missions: 244 passing; economy: 19; store: 16; puzzle UI harness: 33; rated-game, privacy, resignation/leaderboard and call-signaling integration checks passed with isolated fixture providers and databases.
- Chess initial-position perft: 20, 400, 8902; pawn-controlled castling transit regression passed. All 36,300 archive entries build successfully; no duplicate IDs.
- Desktop browser QA at mobile widths 320/360 and tablet layout, Arabic/English; actual Nour opening reply and puzzle hint/practice flow checked.
- Android release APK/AAB signed with existing upload certificate; release Lint reports no issues.

Browser viewport checks and desktop engine tests do not establish handset FPS. Physical-device performance and installation should be checked using the published APK.
