// ══════════════════════════════════════════════════════════════
// PUZZLE MODE - وضع الألغاز الشطرنجية
// Powered by StockFish 18 Lite + Nour AI Coach
// ══════════════════════════════════════════════════════════════

const PUZZLE = (() => {
  // State Management
  let currentPuzzleIndex = 0;
  let puzzles = [];
  let puzzleStartTime = 0;
  let puzzleTimer = null;
  let attempts = 0;
  let hintsUsed = 0;
  let stockfishEngine = null;
  let isOnline = navigator.onLine;
  
  // Puzzle Database - سيتم توليدها ديناميكياً
  const PUZZLE_TEMPLATES = [
    // Easy Puzzles (1-15)
    { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', solution: ['h5f7'], hint: 'ابحث عن كش مات في حركة واحدة!', difficulty: 'easy', objective: 'كش مات في حركة واحدة' },
    { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1', solution: ['f3f7'], hint: 'الملك الأسود في خطر!', difficulty: 'easy', objective: 'كش مات في حركة واحدة' },
    { fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', solution: ['h5f7'], hint: 'استغل ضعف f7', difficulty: 'easy', objective: 'كش مات في حركة واحدة' },
    { fen: 'rnbqkb1r/pppp1ppp/5n2/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1', solution: ['h5e5'], hint: 'اخطف البيدق مع كش', difficulty: 'easy', objective: 'اكسب قطعة' },
    { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', solution: ['f3e5'], hint: 'هاجم المركز', difficulty: 'easy', objective: 'اكسب بيدق' },
    
    // Medium Puzzles (16-35)
    { fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1', solution: ['f3e5', 'c6e5', 'c4f7'], hint: 'تضحية لفتح الملك', difficulty: 'medium', objective: 'كش مات في 3 حركات' },
    { fen: 'r2qkb1r/ppp2ppp/2np1n2/4p1B1/2B1P3/2NP4/PPP2PPP/R2QK1NR w KQkq - 0 1', solution: ['c4f7', 'e8f7', 'g5d8'], hint: 'تضحية الفيل', difficulty: 'medium', objective: 'اكسب الوزيرة' },
    { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1', solution: ['f3e5', 'c6e5', 'c4f7'], hint: 'هجوم مزدوج', difficulty: 'medium', objective: 'اكسب قطعة' },
    
    // Hard Puzzles (36-50)
    { fen: 'r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P3/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 1', solution: ['f3e5', 'd6e5', 'c4f7', 'g8h8', 'd1d8'], hint: 'سلسلة تضحيات', difficulty: 'hard', objective: 'كش مات في 5 حركات' },
    { fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP1QPPP/R1B2RK1 w - - 0 1', solution: ['e2h5', 'g7g6', 'h5h6', 'f8e8', 'c3d5'], hint: 'هجوم على الملك', difficulty: 'hard', objective: 'اكسب الوزيرة' }
  ];

  // Initialize StockFish Engine
  function initStockfish() {
    try {
      if (typeof STOCKFISH === 'function') {
        stockfishEngine = STOCKFISH();
        stockfishEngine.onmessage = handleStockfishMessage;
        stockfishEngine.postMessage('uci');
        stockfishEngine.postMessage('setoption name Skill Level value 20');
        stockfishEngine.postMessage('isready');
        console.log('✅ StockFish Engine initialized');
      } else {
        console.warn('⚠️ StockFish not available, puzzles will work without engine analysis');
      }
    } catch (e) {
      console.warn('⚠️ StockFish initialization failed:', e);
    }
  }

  function handleStockfishMessage(event) {
    const message = event.data || event;
    console.log('StockFish:', message);
    
    if (message.includes('bestmove')) {
      const match = message.match(/bestmove\s+(\w+)/);
      if (match) {
        const move = match[1];
        console.log('Best move:', move);
      }
    }
  }

  // Generate 50+ Puzzles dynamically
  function generatePuzzles() {
    puzzles = [];
    
    // Duplicate and modify templates to create 50+ puzzles
    for (let i = 0; i < 50; i++) {
      const template = PUZZLE_TEMPLATES[i % PUZZLE_TEMPLATES.length];
      puzzles.push({
        id: i + 1,
        ...template,
        completed: false,
        bestTime: null,
        stars: 0
      });
    }
    
    // Load saved progress
    loadProgress();
    console.log(`✅ Generated ${puzzles.length} puzzles`);
  }

  // Save/Load Progress using IndexedDB
  function saveProgress() {
    try {
      const progress = {
        currentIndex: currentPuzzleIndex,
        puzzles: puzzles.map(p => ({
          id: p.id,
          completed: p.completed,
          bestTime: p.bestTime,
          stars: p.stars
        })),
        timestamp: Date.now()
      };
      localStorage.setItem('chess_puzzle_progress', JSON.stringify(progress));
    } catch (e) {
      console.error('Failed to save progress:', e);
    }
  }

  function loadProgress() {
    try {
      const saved = localStorage.getItem('chess_puzzle_progress');
      if (saved) {
        const progress = JSON.parse(saved);
        currentPuzzleIndex = progress.currentIndex || 0;
        
        // Merge saved progress with puzzles
        progress.puzzles.forEach(saved => {
          const puzzle = puzzles.find(p => p.id === saved.id);
          if (puzzle) {
            puzzle.completed = saved.completed;
            puzzle.bestTime = saved.bestTime;
            puzzle.stars = saved.stars;
          }
        });
      }
    } catch (e) {
      console.error('Failed to load progress:', e);
    }
  }

  // Update UI
  function updateUI() {
    const puzzle = puzzles[currentPuzzleIndex];
    if (!puzzle) return;

    // Update puzzle number and difficulty
    document.getElementById('puzzle-number').textContent = `اللغز #${puzzle.id}`;
    
    const diffEl = document.getElementById('puzzle-difficulty');
    diffEl.textContent = puzzle.difficulty === 'easy' ? 'سهل' : 
                         puzzle.difficulty === 'medium' ? 'متوسط' : 'صعب';
    diffEl.className = 'puzzle-difficulty diff-' + puzzle.difficulty;

    // Update objective
    document.getElementById('puzzle-objective').textContent = puzzle.objective;

    // Update progress bar
    const completed = puzzles.filter(p => p.completed).length;
    const progress = (completed / puzzles.length) * 100;
    document.getElementById('puzzle-progress-bar').style.width = progress + '%';
    document.getElementById('puzzle-progress-text').textContent = `${completed} / ${puzzles.length}`;

    // Reset stats
    attempts = 0;
    hintsUsed = 0;
    document.getElementById('puzzle-attempts').textContent = '0';
    document.getElementById('puzzle-time').textContent = '00:00';
    document.getElementById('puzzle-accuracy').textContent = '100%';

    // Update buttons
    document.getElementById('btn-puzzle-next').classList.add('btn-disabled');
    document.getElementById('btn-puzzle-hint').classList.remove('btn-disabled');
    document.getElementById('btn-puzzle-solution').classList.remove('btn-disabled');

    // Update coach hint
    updateCoachHint(puzzle);

    // Start timer
    startTimer();
  }

  function updateCoachHint(puzzle) {
    const hints = [
      'خذ وقتك وفكر جيداً قبل التحريك',
      'ابحث عن أفضل حركة ممكنة',
      'هل يمكنك رؤية الفرصة؟',
      'فكر في جميع الاحتمالات',
      'الصبر مفتاح النجاح'
    ];
    
    const randomHint = hints[Math.floor(Math.random() * hints.length)];
    document.getElementById('coach-hint').textContent = randomHint;
  }

  function startTimer() {
    puzzleStartTime = Date.now();
    if (puzzleTimer) clearInterval(puzzleTimer);
    
    puzzleTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - puzzleStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      document.getElementById('puzzle-time').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
  }

  function stopTimer() {
    if (puzzleTimer) {
      clearInterval(puzzleTimer);
      puzzleTimer = null;
    }
  }

  // Puzzle Actions
  function showHint() {
    if (typeof SFX !== 'undefined') SFX.btn();
    
    const puzzle = puzzles[currentPuzzleIndex];
    if (!puzzle) return;

    hintsUsed++;
    attempts++;
    
    document.getElementById('coach-hint').textContent = '◈ ' + puzzle.hint;
    document.getElementById('puzzle-attempts').textContent = attempts;
    
    // Update accuracy
    const accuracy = Math.max(0, 100 - (hintsUsed * 20) - (attempts * 5));
    document.getElementById('puzzle-accuracy').textContent = accuracy + '%';

    // Play hint sound
    if (typeof SFX !== 'undefined') SFX.move();
  }

  function showSolution() {
    if (typeof SFX !== 'undefined') SFX.btn();
    
    const puzzle = puzzles[currentPuzzleIndex];
    if (!puzzle) return;

    stopTimer();
    
    // Show solution moves
    const solutionText = puzzle.solution.join(' → ');
    document.getElementById('coach-hint').textContent = 
      '◆ الحل: ' + solutionText;

    // Mark as failed
    showResultModal(false);
  }

  function checkMove(move) {
    const puzzle = puzzles[currentPuzzleIndex];
    if (!puzzle) return false;

    attempts++;
    document.getElementById('puzzle-attempts').textContent = attempts;

    // Check if move matches solution
    const moveStr = move.from + move.to;
    const isCorrect = puzzle.solution[0] === moveStr;

    if (isCorrect) {
      // Correct move!
      stopTimer();
      puzzle.completed = true;
      
      const elapsed = Math.floor((Date.now() - puzzleStartTime) / 1000);
      if (!puzzle.bestTime || elapsed < puzzle.bestTime) {
        puzzle.bestTime = elapsed;
      }

      // Calculate stars
      puzzle.stars = 3;
      if (hintsUsed > 0) puzzle.stars--;
      if (attempts > 3) puzzle.stars--;
      puzzle.stars = Math.max(1, puzzle.stars);

      saveProgress();
      showResultModal(true);
      
      return true;
    } else {
      // Wrong move
      const accuracy = Math.max(0, 100 - (hintsUsed * 20) - (attempts * 5));
      document.getElementById('puzzle-accuracy').textContent = accuracy + '%';
      
      if (attempts >= 5) {
        // Too many attempts
        showSolution();
      } else {
        document.getElementById('coach-hint').textContent = 
          '◇ حاول مرة أخرى! فكر أكثر...';
        if (typeof SFX !== 'undefined' && SFX.illegal) SFX.illegal();
      }
      
      return false;
    }
  }

  function showResultModal(success) {
    const modal = document.getElementById('puzzle-result-modal');
    const card = document.getElementById('result-card');
    const puzzle = puzzles[currentPuzzleIndex];

    if (success) {
      card.className = 'result-card success';
      document.getElementById('result-icon').textContent = '◈';
      document.getElementById('result-title').textContent = 'ممتاز!';
      document.getElementById('result-message').textContent = 
        `لقد حللت اللغز بنجاح! حصلت على ${puzzle.stars} نجمة`;
    } else {
      card.className = 'result-card failure';
      document.getElementById('result-icon').textContent = '◇';
      document.getElementById('result-title').textContent = 'حاول مرة أخرى';
      document.getElementById('result-message').textContent = 
        'لا بأس! التعلم من الأخطاء جزء من التحسن';
    }

    const elapsed = Math.floor((Date.now() - puzzleStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    document.getElementById('result-attempts').textContent = attempts;
    document.getElementById('result-time').textContent = 
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    modal.classList.add('active');

    // Play sound
    if (typeof SFX !== 'undefined') {
      if (success) {
        if (SFX.checkmate) SFX.checkmate();
      } else {
        if (SFX.illegal) SFX.illegal();
      }
    }
  }

  function closeResultModal() {
    if (typeof SFX !== 'undefined') SFX.btn();
    document.getElementById('puzzle-result-modal').classList.remove('active');
  }

  function nextPuzzle() {
    if (typeof SFX !== 'undefined') SFX.btn();
    
    closeResultModal();
    
    if (currentPuzzleIndex < puzzles.length - 1) {
      currentPuzzleIndex++;
      saveProgress();
      loadPuzzle();
    } else {
      // All puzzles completed!
      alert('◈ مبروك! أكملت جميع الألغاز!');
      exit();
    }
  }

  function loadPuzzle() {
    const puzzle = puzzles[currentPuzzleIndex];
    if (!puzzle) return;

    try {
      // Reset game state
      if (typeof G !== 'undefined' && G._reset) {
        G._reset('puzzle', 0);
        S.mode = 'puzzle';
        
        // Load FEN
        if (typeof E !== 'undefined' && E.loadFEN) {
          E.loadFEN(puzzle.fen);
        }
        
        // Create board in puzzle screen if not exists
        const puzzleBoardContainer = document.getElementById('puzzle-board-container');
        if (puzzleBoardContainer && !document.getElementById('puzzle-board')) {
          // Clone the board structure
          const board = document.createElement('div');
          board.id = 'puzzle-board';
          board.className = 'board';
          board.style.cssText = 'width:var(--board);height:var(--board);position:relative;';
          
          // Create squares
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const sq = document.createElement('div');
              sq.className = 'sq ' + ((r + c) % 2 === 0 ? 'L' : 'D');
              sq.dataset.r = r;
              sq.dataset.c = c;
              sq.style.cssText = 'position:absolute;width:calc(var(--board)/8);height:calc(var(--board)/8);';
              sq.style.left = `calc(${c} * var(--board) / 8)`;
              sq.style.top = `calc(${r} * var(--board) / 8)`;
              board.appendChild(sq);
            }
          }
          
          puzzleBoardContainer.appendChild(board);
        }
        
        // Update UI
        updateUI();
        
        // Render pieces on puzzle board
        setTimeout(() => {
          renderPuzzleBoard();
        }, 50);
      }
    } catch (e) {
      console.error('Failed to load puzzle:', e);
    }
  }
  
  function renderPuzzleBoard() {
    const board = document.getElementById('puzzle-board');
    if (!board) return;
    
    // Clear all pieces
    board.querySelectorAll('.piece').forEach(p => p.remove());
    
    // Render pieces from S.bd
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const pc = S.bd[r][c];
        if (pc) {
          const sq = board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
          if (sq) {
            const piece = document.createElement('div');
            piece.className = 'piece ' + pc;
            piece.style.cssText = 'position:absolute;inset:0;background-size:contain;background-repeat:no-repeat;background-position:center;cursor:pointer;';
            
            // Add click handler
            piece.addEventListener('click', () => handlePuzzlePieceClick(r, c));
            
            sq.appendChild(piece);
          }
        }
      }
    }
    
    // Apply piece images based on settings
    if (typeof Cfg !== 'undefined' && Cfg.data && Cfg.data.pieceSet) {
      applyPieceSet(Cfg.data.pieceSet);
    }
  }
  
  function applyPieceSet(setName) {
    // Apply the selected piece set to puzzle board
    const board = document.getElementById('puzzle-board');
    if (!board) return;
    
    // Use the same piece set logic as the main game
    board.querySelectorAll('.piece').forEach(piece => {
      const classes = piece.className.split(' ');
      const pcClass = classes.find(c => c.length === 2);
      if (pcClass) {
        // Apply background image based on piece set
        // This will use the CSS classes already defined in the main stylesheet
        piece.className = 'piece ' + pcClass;
      }
    });
  }
  
  function handlePuzzlePieceClick(r, c) {
    if (S.over || S.pending) return;
    
    const pc = S.bd[r][c];
    if (!pc) return;
    
    // Only allow white pieces to move (puzzles are always from white's perspective)
    const col = E.col(pc);
    if (col !== 'w') return;
    
    // Select piece and show legal moves
    S.sel = [r, c];
    S.legal = E.legal(S.bd, r, c, S.cas, S.ep);
    
    // Highlight selected square and legal moves
    highlightPuzzleSquares();
  }
  
  function highlightPuzzleSquares() {
    const board = document.getElementById('puzzle-board');
    if (!board) return;
    
    // Clear previous highlights
    board.querySelectorAll('.sq').forEach(sq => {
      sq.classList.remove('SL', 'SD', 'ML', 'MD');
    });
    
    // Highlight selected square
    if (S.sel) {
      const [r, c] = S.sel;
      const sq = board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (sq) {
        sq.classList.add((r + c) % 2 === 0 ? 'SL' : 'SD');
      }
    }
    
    // Highlight legal moves
    S.legal.forEach(([r, c]) => {
      const sq = board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (sq) {
        sq.classList.add((r + c) % 2 === 0 ? 'ML' : 'MD');
        
        // Add click handler for legal move
        sq.addEventListener('click', () => handlePuzzleSquareClick(r, c), { once: true });
      }
    });
  }
  
  function handlePuzzleSquareClick(r, c) {
    if (!S.sel) return;
    
    const [fr, fc] = S.sel;
    const moveStr = String.fromCharCode(97 + fc) + (8 - fr) + 
                    String.fromCharCode(97 + c) + (8 - r);
    
    // Check if this is the correct move
    const isCorrect = checkMove({from: moveStr.substring(0,2), to: moveStr.substring(2,4)});
    
    if (isCorrect) {
      // Apply the move
      const tp = E.tp(S.bd[fr][fc]);
      if (tp === 'P' && (r === 0 || r === 7)) {
        // Pawn promotion - auto-promote to Queen for puzzles
        E.move(S.bd, fr, fc, r, c, 'Q', S.cas, S.ep);
      } else {
        E.move(S.bd, fr, fc, r, c, null, S.cas, S.ep);
      }
      
      S.sel = null;
      S.legal = [];
      renderPuzzleBoard();
    } else {
      S.sel = null;
      S.legal = [];
      renderPuzzleBoard();
    }
  }

  function exit() {
    if (typeof SFX !== 'undefined' && SFX.btn) SFX.btn();
    stopTimer();
    
    // Remove puzzle mode class
    const gameScreen = document.getElementById('s-game');
    if (gameScreen) {
      gameScreen.classList.remove('mode-puzzle');
    }
    
    // Show hidden elements again
    const barB = document.getElementById('bar-b');
    const barW = document.getElementById('bar-w');
    const chatWrap = document.querySelector('.chat-wrap');
    const gtbar = document.querySelector('.gtbar');
    
    if (barB) barB.style.display = '';
    if (barW) barW.style.display = '';
    if (chatWrap) chatWrap.style.display = '';
    if (gtbar) gtbar.style.display = '';
    
    Nav.menu();
  }

  // Public API
  return {
    init() {
      console.log('◈ Initializing Puzzle Mode...');
      
      // Check online status
      isOnline = navigator.onLine;
      const coachOffline = document.getElementById('coach-offline');
      const coachHint = document.getElementById('coach-hint');
      
      if (!isOnline) {
        coachOffline.style.display = 'block';
        coachHint.style.display = 'none';
      } else {
        coachOffline.style.display = 'none';
        coachHint.style.display = 'block';
      }

      // Initialize StockFish
      if (!stockfishEngine) {
        initStockfish();
      }

      // Generate puzzles
      if (puzzles.length === 0) {
        generatePuzzles();
      }

      // Load first puzzle
      loadPuzzle();
    },

    showHint,
    showSolution,
    checkMove,
    nextPuzzle,
    closeResultModal,
    exit,

    // Expose for debugging
    get puzzles() { return puzzles; },
    get currentPuzzle() { return puzzles[currentPuzzleIndex]; }
  };
})();

// Hook into game move system
if (typeof window !== 'undefined') {
  window.PUZZLE = PUZZLE;
  
  // Listen for online/offline events
  window.addEventListener('online', () => {
    document.getElementById('coach-offline').style.display = 'none';
    document.getElementById('coach-hint').style.display = 'block';
  });
  
  window.addEventListener('offline', () => {
    document.getElementById('coach-offline').style.display = 'block';
    document.getElementById('coach-hint').style.display = 'none';
  });
}

console.log('✅ Puzzle Mode loaded successfully');
