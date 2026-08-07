"""
Download ALL chess piece images from chess.com for offline use.
Each theme has 12 pieces: wk, wq, wr, wb, wn, wp, bk, bq, br, bb, bn, bp
Images are saved as pieces/<theme_name>/<piece>.png
"""
import urllib.request
import os
import sys
import time

THEMES = {
    # 2D Themes
    'neo': 'neo',
    'classic': 'classic',
    'alpha': 'alpha',
    'bases': 'bases',
    'icy_sea': 'icy_sea',
    'neo_wood': 'neo_wood',
    'glass': 'glass',
    'marble': 'marble',
    'game_room': 'game_room',
    'tournament': 'tournament',
    'metal': 'metal',
    'modern': 'modern',
    'vintage': 'vintage',
    'graffiti': 'graffiti',
    'neon': 'neon',
    'ocean': 'ocean',
    'sky': 'sky',
    'space': 'space',
    'bubblegum': 'bubblegum',
    '8_bit': '8_bit',
    'light': 'light',
    'newspaper': 'newspaper',
    'nature': 'nature',
    'maya': 'maya',
    'club': 'club',
    'gothic': 'gothic',
    'condal': 'condal',
    'dash': 'dash',
    'lolz': 'lolz',
    'tigers': 'tigers',
    'book': 'book',
    'cases': 'cases',
    # 3D Themes
    '3d_wood': '3d_wood',
    '3d_staunton': '3d_staunton',
    '3d_plastic': '3d_plastic',
    '3d_chesskid': '3d_chesskid',
}

PIECES = ['wk', 'wq', 'wr', 'wb', 'wn', 'wp', 'bk', 'bq', 'br', 'bb', 'bn', 'bp']

BASE_URL = 'https://images.chesscomfiles.com/chess-themes/pieces/{theme}/150/{piece}.png'

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

def download_piece(theme_dir, theme_url_name, piece):
    """Download a single piece image"""
    url = BASE_URL.format(theme=theme_url_name, piece=piece)
    filepath = os.path.join(theme_dir, f'{piece}.png')
    
    if os.path.exists(filepath) and os.path.getsize(filepath) > 500:
        return True  # Already downloaded
    
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            if len(data) > 500:  # Valid image
                with open(filepath, 'wb') as f:
                    f.write(data)
                return True
    except Exception as e:
        print(f'  FAILED: {piece} from {theme_url_name} - {e}')
    return False

def main():
    pieces_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pieces')
    os.makedirs(pieces_root, exist_ok=True)
    
    total_themes = len(THEMES)
    total_pieces = total_themes * len(PIECES)
    downloaded = 0
    failed = 0
    skipped = 0
    
    print(f'Downloading {total_pieces} piece images for {total_themes} themes...')
    print(f'Output directory: {pieces_root}')
    print()
    
    for i, (theme_key, theme_url) in enumerate(THEMES.items()):
        theme_dir = os.path.join(pieces_root, theme_key)
        os.makedirs(theme_dir, exist_ok=True)
        
        theme_ok = 0
        theme_fail = 0
        
        for piece in PIECES:
            filepath = os.path.join(theme_dir, f'{piece}.png')
            if os.path.exists(filepath) and os.path.getsize(filepath) > 500:
                skipped += 1
                theme_ok += 1
                continue
                
            success = download_piece(theme_dir, theme_url, piece)
            if success:
                downloaded += 1
                theme_ok += 1
            else:
                failed += 1
                theme_fail += 1
            time.sleep(0.05)  # Small delay to be respectful
        
        status = 'OK' if theme_fail == 0 else f'PARTIAL ({theme_fail} failed)'
        print(f'[{i+1}/{total_themes}] {theme_key}: {status} ({theme_ok}/12 pieces)')
    
    print()
    print(f'=== SUMMARY ===')
    print(f'Downloaded: {downloaded}')
    print(f'Skipped (already existed): {skipped}')
    print(f'Failed: {failed}')
    print(f'Total: {downloaded + skipped + failed}/{total_pieces}')

if __name__ == '__main__':
    main()
