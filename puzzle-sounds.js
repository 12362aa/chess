// ══════════════════════════════════════════════════════════════
// PUZZLE MODE SOUNDS - أصوات وضع الألغاز
// Enhanced audio experience for puzzle solving
// ══════════════════════════════════════════════════════════════

const PUZZLE_SOUNDS = (() => {
  // Sound URLs (يمكن استبدالها بأصوات مخصصة)
  const sounds = {
    puzzleStart: 'startgame.mp3',
    puzzleSuccess: 'checkmate.mp3',
    puzzleFail: 'Error.mp3',
    hint: 'move.mp3',
    tick: 'move.mp3',
    celebration: 'checkmate.mp3'
  };

  // Audio context for better control
  let audioContext = null;
  let isMuted = false;

  function init() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('✅ Puzzle Sounds initialized');
    } catch (e) {
      console.warn('Audio context not supported:', e);
    }
  }

  function play(soundName) {
    if (isMuted || !sounds[soundName]) return;

    try {
      const audio = new Audio(sounds[soundName]);
      audio.volume = 0.5;
      audio.play().catch(e => console.warn('Sound play failed:', e));
    } catch (e) {
      console.warn('Failed to play sound:', e);
    }
  }

  function playSuccess() {
    play('puzzleSuccess');
    
    // Add celebration sound after a delay
    setTimeout(() => {
      play('celebration');
    }, 500);
  }

  function playFail() {
    play('puzzleFail');
  }

  function playHint() {
    play('hint');
  }

  function playTick() {
    play('tick');
  }

  function playStart() {
    play('puzzleStart');
  }

  function mute() {
    isMuted = true;
  }

  function unmute() {
    isMuted = false;
  }

  function toggle() {
    isMuted = !isMuted;
    return !isMuted;
  }

  // Public API
  return {
    init,
    playSuccess,
    playFail,
    playHint,
    playTick,
    playStart,
    mute,
    unmute,
    toggle,
    get isMuted() { return isMuted; }
  };
})();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.PUZZLE_SOUNDS = PUZZLE_SOUNDS;
  
  // Initialize on user interaction
  document.addEventListener('click', () => {
    if (!PUZZLE_SOUNDS.audioContext) {
      PUZZLE_SOUNDS.init();
    }
  }, { once: true });
}

console.log('✅ Puzzle Sounds module loaded');
